import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, extname } from "node:path";
import { realpath, readFile, stat } from "node:fs/promises";
import type { GatewayConfig, Logger, RemoteCopyApi, RemoteCopyCandidate } from "./types.js";

const checksumPattern = /^[a-f0-9]{64}$/i;
const mimeByExtension: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".doc": "application/msword",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
};

export class RemoteCopyError extends Error {
  constructor(public code: string, message = code) {
    super(message);
  }
}

const isWithin = (root: string, target: string) => {
  const fromRoot = relative(root, target);
  return Boolean(fromRoot) && fromRoot !== ".." && !fromRoot.startsWith(`..\\`) && !fromRoot.startsWith("../") && !isAbsolute(fromRoot);
};

export const resolveAuthorizedSource = async (rootPath: string, persistedReference: string) => {
  if (!persistedReference.trim() || persistedReference.includes("\0")) throw new RemoteCopyError("invalid_source_reference");
  const configuredRoot = await realpath(rootPath).catch(() => { throw new RemoteCopyError("gateway_root_unavailable"); });
  const candidate = resolve(configuredRoot, persistedReference);
  if (!isWithin(configuredRoot, candidate)) throw new RemoteCopyError("path_outside_root");
  const resolvedSource = await realpath(candidate).catch(() => { throw new RemoteCopyError("local_file_missing"); });
  if (!isWithin(configuredRoot, resolvedSource)) throw new RemoteCopyError("path_outside_root");
  const information = await stat(resolvedSource).catch(() => { throw new RemoteCopyError("local_file_missing"); });
  if (!information.isFile()) throw new RemoteCopyError("source_not_file");
  return { path: resolvedSource, size: information.size };
};

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const safeErrorCode = (error: unknown) => error instanceof RemoteCopyError && /^[a-z0-9_]{1,64}$/.test(error.code)
  ? error.code
  : error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[a-z0-9_]{1,64}$/.test(error.code)
    ? error.code
    : "remote_copy_failed";

export class LocalToCloudWorker {
  constructor(
    private readonly config: GatewayConfig,
    private readonly api: RemoteCopyApi,
    private readonly log: Logger,
  ) {}

  async copyCandidate(candidate: RemoteCopyCandidate) {
    const source = await resolveAuthorizedSource(this.config.rootPath, candidate.source_reference);
    if (source.size <= 0 || source.size > this.config.maxUploadBytes) throw new RemoteCopyError("local_file_size_invalid");
    const expectedSize = candidate.expected_file_size === null ? undefined : Number(candidate.expected_file_size);
    if (expectedSize !== undefined && (!Number.isSafeInteger(expectedSize) || expectedSize !== source.size)) {
      throw new RemoteCopyError("local_metadata_mismatch");
    }
    const mimeType = candidate.expected_mime_type?.toLowerCase() ?? mimeByExtension[extname(source.path).toLowerCase()];
    if (!mimeType) throw new RemoteCopyError("mime_type_missing");
    const bytes = new Uint8Array(await readFile(source.path));
    if (bytes.byteLength !== source.size) throw new RemoteCopyError("local_file_changed");
    const checksum = sha256(bytes);
    if (candidate.expected_checksum && (!checksumPattern.test(candidate.expected_checksum) || checksum !== candidate.expected_checksum.toLowerCase())) {
      throw new RemoteCopyError("checksum_mismatch");
    }

    const prepared = await this.api.prepareRemoteUpload(candidate.job_id, mimeType, bytes.byteLength, checksum);
    if (prepared.status === "completed") {
      this.log.info("remote_copy_already_available", { jobId: candidate.job_id, attachmentId: candidate.attachment_id });
      return;
    }
    if (!prepared.signedUploadUrl) throw new RemoteCopyError("upload_authorization_missing");
    await this.api.uploadRemote(prepared.signedUploadUrl, bytes, mimeType);
    await this.api.completeRemoteUpload(candidate.job_id, prepared.locationId, mimeType, bytes.byteLength, checksum);
    this.log.info("remote_copy_completed", { jobId: candidate.job_id, attachmentId: candidate.attachment_id });
  }

  async runOnce() {
    const candidates = await this.api.claimRemoteCopies();
    for (const candidate of candidates) {
      try {
        await this.copyCandidate(candidate);
      } catch (error) {
        const errorCode = safeErrorCode(error);
        const retryAfterSeconds = Math.min(86_400, Math.max(5, Math.round(this.config.retryBaseMs * 2 ** Math.max(0, candidate.attempt_count - 1) / 1_000)));
        await this.api.failRemoteCopy(candidate.job_id, errorCode, retryAfterSeconds).catch(() => {
          this.log.error("remote_copy_failure_not_reported", { jobId: candidate.job_id, errorCode });
        });
        this.log.warn("remote_copy_failed", { jobId: candidate.job_id, errorCode, attempt: candidate.attempt_count });
      }
    }
    return candidates.length;
  }
}
