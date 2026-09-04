import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import type { GatewayApi, GatewayConfig, Logger, SyncCandidate } from "./types.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const checksumPattern = /^[a-f0-9]{64}$/i;

export class SyncError extends Error {
  constructor(public code: string, message = code) {
    super(message);
  }
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const exists = async (filePath: string) => access(filePath, constants.F_OK).then(() => true, () => false);

export const buildRelativePath = (candidate: SyncCandidate) => {
  const objectSegments = candidate.object_key.split("/");
  const objectId = basename(candidate.object_key);
  if (
    !uuidPattern.test(candidate.organization_id)
    || !uuidPattern.test(candidate.document_id)
    || !uuidPattern.test(candidate.attachment_id)
    || !uuidPattern.test(objectId)
    || objectSegments.length !== 4
    || objectSegments[0]?.toLowerCase() !== candidate.organization_id.toLowerCase()
    || objectSegments[1]?.toLowerCase() !== candidate.document_id.toLowerCase()
    || objectSegments[2]?.toLowerCase() !== candidate.attachment_id.toLowerCase()
  ) throw new SyncError("metadata_inconsistent");
  return `${candidate.organization_id}/${candidate.document_id}/${candidate.attachment_id}/${objectId}`;
};

const targetWithinRoot = (rootPath: string, relativePath: string) => {
  const destination = resolve(rootPath, ...relativePath.split("/"));
  const fromRoot = relative(rootPath, destination);
  if (!fromRoot || fromRoot.startsWith("..") || resolve(rootPath, fromRoot) !== destination) {
    throw new SyncError("unsafe_destination");
  }
  return destination;
};

const readAndHash = async (filePath: string) => sha256(await readFile(filePath));

const downloadBytes = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "Cache-Control": "no-store" } });
    if (!response.ok) throw new SyncError(response.status === 404 ? "object_missing" : "download_failed");
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError("download_failed");
  } finally {
    clearTimeout(timer);
  }
};

export const atomicPublishErrorCode = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EEXIST") return "local_conflict";
  if (code === "EPERM" || code === "ENOTSUP" || code === "EXDEV") return "atomic_publish_unsupported";
  return "local_write_failed";
};

const publishWithoutOverwrite = async (temporaryPath: string, destination: string) => {
  try {
    await link(temporaryPath, destination);
    await unlink(temporaryPath);
  } catch (error) {
    throw new SyncError(atomicPublishErrorCode(error));
  }
};

const safeErrorCode = (error: unknown) => error instanceof SyncError && /^[a-z0-9_]{1,64}$/.test(error.code)
  ? error.code
  : "sync_failed";

export class FileSyncWorker {
  constructor(
    private readonly config: GatewayConfig,
    private readonly api: GatewayApi,
    private readonly log: Logger,
    private readonly downloader: (url: string, timeoutMs: number) => Promise<Uint8Array> = downloadBytes,
  ) {}

  async syncCandidate(candidate: SyncCandidate) {
    if (!checksumPattern.test(candidate.checksum)) throw new SyncError("metadata_inconsistent");
    const expectedSize = Number(candidate.file_size);
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || !candidate.mime_type) throw new SyncError("metadata_inconsistent");
    const relativePath = buildRelativePath(candidate);
    const destination = targetWithinRoot(this.config.rootPath, relativePath);
    await mkdir(dirname(destination), { recursive: true });

    if (await exists(destination)) {
      const existingChecksum = await readAndHash(destination);
      if (existingChecksum !== candidate.checksum.toLowerCase()) throw new SyncError("local_conflict");
      const existing = await readFile(destination);
      if (existing.byteLength !== expectedSize) throw new SyncError("local_conflict");
      await this.api.complete({ locationId: candidate.cloud_location_id, relativePath, mimeType: candidate.mime_type, fileSize: expectedSize, checksum: existingChecksum });
      this.log.info("file_already_synchronized", { locationId: candidate.cloud_location_id });
      return;
    }

    await mkdir(this.config.tempPath, { recursive: true });
    const temporaryPath = resolve(this.config.tempPath, `.partial-${randomUUID()}`);
    try {
      let signedUrl: string;
      try {
        signedUrl = await this.api.getDownloadUrl(candidate.cloud_location_id);
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "object_unavailable") {
          throw new SyncError("object_missing");
        }
        throw error;
      }
      const bytes = await this.downloader(signedUrl, this.config.downloadTimeoutMs);
      await writeFile(temporaryPath, bytes, { flag: "wx" });
      const downloadedChecksum = sha256(bytes);
      if (bytes.byteLength !== expectedSize || downloadedChecksum !== candidate.checksum.toLowerCase()) {
        throw new SyncError("checksum_mismatch");
      }
      await publishWithoutOverwrite(temporaryPath, destination);
      await this.api.complete({ locationId: candidate.cloud_location_id, relativePath, mimeType: candidate.mime_type, fileSize: bytes.byteLength, checksum: downloadedChecksum });
      this.log.info("file_synchronized", { locationId: candidate.cloud_location_id });
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  async runOnce() {
    const candidates = await this.api.claim();
    for (const candidate of candidates) {
      try {
        await this.syncCandidate(candidate);
      } catch (error) {
        const errorCode = safeErrorCode(error);
        const retryAfterSeconds = Math.min(86_400, Math.max(5, Math.round(this.config.retryBaseMs * 2 ** Math.max(0, candidate.attempt_count - 1) / 1_000)));
        await this.api.failed(candidate.cloud_location_id, errorCode, retryAfterSeconds).catch(() => {
          this.log.error("file_sync_failure_not_reported", { locationId: candidate.cloud_location_id, errorCode });
        });
        this.log.warn("file_sync_failed", { locationId: candidate.cloud_location_id, errorCode, attempt: candidate.attempt_count });
      }
    }
    return candidates.length;
  }
}
