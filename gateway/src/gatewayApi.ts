import type { CompleteSyncInput, GatewayApi, GatewayConfig, RemoteCopyApi, RemoteCopyCandidate, RemoteUploadPreparation, SyncCandidate } from "./types.js";

interface GatewayResponse {
  candidates?: Array<SyncCandidate | RemoteCopyCandidate>;
  signedUrl?: string;
  signedUploadUrl?: string;
  locationId?: string;
  status?: "uploading" | "completed";
  error?: string;
  code?: string;
}

export class GatewayHttpError extends Error {
  constructor(public status: number, public code: string) {
    super(`Gateway request failed (${code}).`);
  }
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class HttpGatewayApi implements GatewayApi, RemoteCopyApi {
  readonly #endpoint: string;

  constructor(private readonly config: GatewayConfig, private readonly fetcher: typeof fetch = fetch) {
    this.#endpoint = `${config.supabaseUrl}/functions/v1/file-gateway`;
  }

  async #request(body: Record<string, unknown>): Promise<GatewayResponse> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRequestRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
      try {
        const response = await this.fetcher(this.#endpoint, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.config.token}`,
            "Content-Type": "application/json",
            "X-Gateway-Id": this.config.gatewayId,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({})) as GatewayResponse;
        if (response.ok) return payload;
        const error = new GatewayHttpError(response.status, payload.code ?? "gateway_error");
        if (response.status < 500 && response.status !== 429) throw error;
        lastError = error;
      } catch (error) {
        if (error instanceof GatewayHttpError && error.status < 500 && error.status !== 429) throw error;
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
      if (attempt < this.config.maxRequestRetries) {
        await delay(this.config.retryBaseMs * 2 ** attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Gateway request failed.");
  }

  async claim() {
    const response = await this.#request({
      action: "claim",
      limit: this.config.batchSize,
      leaseSeconds: this.config.leaseSeconds,
      maxAttempts: this.config.maxSyncAttempts,
    });
    return (response.candidates ?? []) as SyncCandidate[];
  }

  async getDownloadUrl(locationId: string) {
    const response = await this.#request({ action: "download", locationId });
    if (!response.signedUrl) throw new Error("Gateway did not return a download authorization.");
    return response.signedUrl;
  }

  async complete(input: CompleteSyncInput) {
    await this.#request({ action: "complete", ...input });
  }

  async failed(locationId: string, errorCode: string, retryAfterSeconds: number) {
    await this.#request({ action: "failed", locationId, errorCode, retryAfterSeconds });
  }

  async claimRemoteCopies() {
    const response = await this.#request({
      action: "claim-remote",
      limit: this.config.batchSize,
      leaseSeconds: this.config.leaseSeconds,
      maxAttempts: this.config.maxSyncAttempts,
    });
    return (response.candidates ?? []) as RemoteCopyCandidate[];
  }

  async prepareRemoteUpload(jobId: string, mimeType: string, fileSize: number, checksum: string): Promise<RemoteUploadPreparation> {
    const response = await this.#request({ action: "prepare-remote-upload", jobId, mimeType, fileSize, checksum });
    if (!response.status || !response.locationId) throw new Error("Gateway did not return a Cloud destination.");
    if (response.status === "uploading" && !response.signedUploadUrl) throw new Error("Gateway did not return an upload authorization.");
    return { status: response.status, locationId: response.locationId, signedUploadUrl: response.signedUploadUrl };
  }

  async uploadRemote(signedUploadUrl: string, bytes: Uint8Array, mimeType: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.downloadTimeoutMs);
    try {
      const response = await this.fetcher(signedUploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mimeType, "Cache-Control": "max-age=3600", "X-Upsert": "false" },
        body: bytes as BodyInit,
        signal: controller.signal,
      });
      if (!response.ok) throw new GatewayHttpError(response.status, response.status === 409 ? "cloud_object_conflict" : "cloud_upload_failed");
    } catch (error) {
      if (error instanceof GatewayHttpError) throw error;
      throw new GatewayHttpError(502, "cloud_upload_failed");
    } finally {
      clearTimeout(timer);
    }
  }

  async completeRemoteUpload(jobId: string, locationId: string, mimeType: string, fileSize: number, checksum: string) {
    await this.#request({ action: "complete-remote-upload", jobId, locationId, mimeType, fileSize, checksum });
  }

  async failRemoteCopy(jobId: string, errorCode: string, retryAfterSeconds: number) {
    await this.#request({ action: "fail-remote", jobId, errorCode, retryAfterSeconds });
  }
}
