export interface GatewayConfig {
  supabaseUrl: string;
  gatewayId: string;
  token: string;
  rootPath: string;
  batchSize: number;
  pollIntervalMs: number;
  requestTimeoutMs: number;
  downloadTimeoutMs: number;
  maxRequestRetries: number;
  retryBaseMs: number;
  maxSyncAttempts: number;
  leaseSeconds: number;
  maxUploadBytes: number;
}

export interface SyncCandidate {
  cloud_location_id: string;
  attachment_id: string;
  document_id: string;
  organization_id: string;
  bucket_id: string;
  object_key: string;
  mime_type: string;
  file_size: number | string;
  checksum: string;
  location_version: number;
  attempt_count: number;
}

export interface CompleteSyncInput {
  locationId: string;
  relativePath: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
}

export interface GatewayApi {
  claim(): Promise<SyncCandidate[]>;
  getDownloadUrl(locationId: string): Promise<string>;
  complete(input: CompleteSyncInput): Promise<void>;
  failed(locationId: string, errorCode: string, retryAfterSeconds: number): Promise<void>;
}

export interface Logger {
  info(event: string, context?: Record<string, unknown>): void;
  warn(event: string, context?: Record<string, unknown>): void;
  error(event: string, context?: Record<string, unknown>): void;
}

export interface RemoteCopyCandidate {
  job_id: string;
  source_location_id: string;
  attachment_id: string;
  document_id: string;
  organization_id: string;
  source_reference: string;
  file_name: string;
  expected_mime_type: string | null;
  expected_file_size: number | string | null;
  expected_checksum: string | null;
  attempt_count: number;
}

export interface RemoteUploadPreparation {
  status: "uploading" | "completed";
  locationId: string;
  signedUploadUrl?: string;
}

export interface RemoteCopyApi {
  claimRemoteCopies(): Promise<RemoteCopyCandidate[]>;
  prepareRemoteUpload(jobId: string, mimeType: string, fileSize: number, checksum: string): Promise<RemoteUploadPreparation>;
  uploadRemote(signedUploadUrl: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  completeRemoteUpload(jobId: string, locationId: string, mimeType: string, fileSize: number, checksum: string): Promise<void>;
  failRemoteCopy(jobId: string, errorCode: string, retryAfterSeconds: number): Promise<void>;
}
