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
