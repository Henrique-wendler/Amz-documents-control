import type { DocumentAttachment } from "../types/domain";

export type AttachmentStorageType = "network_share" | "supabase_storage" | "external";
export type AttachmentLocationStatus = "uploading" | "active" | "removing" | "inactive" | "failed";
export type RemoteCopyStatus = "pending" | "processing" | "completed" | "failed";
export interface PersistedAttachmentLocation {
  id: string;
  storageType: AttachmentStorageType;
  status: AttachmentLocationStatus;
  version: number;
  remoteCopyStatus?: RemoteCopyStatus;
  remoteCopyErrorCode?: string;
}
export interface PersistedDocumentAttachment extends DocumentAttachment {
  storageType: AttachmentStorageType;
  status: "active" | "inactive";
  version: number;
  locations: PersistedAttachmentLocation[];
}
export interface DocumentAttachmentRepositoryInput {
  fileName: string;
  storageType: AttachmentStorageType;
  filePath: string;
  mimeType?: string;
  fileSize?: number;
}
export interface DocumentAttachmentRepository {
  list(): Promise<PersistedDocumentAttachment[]>;
  listByDocument(documentId: string): Promise<PersistedDocumentAttachment[]>;
  getById(id: string): Promise<PersistedDocumentAttachment | undefined>;
  create(documentId: string, input: DocumentAttachmentRepositoryInput): Promise<PersistedDocumentAttachment>;
  update(id: string, expectedVersion: number, input: DocumentAttachmentRepositoryInput): Promise<PersistedDocumentAttachment>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
  logAccess(id: string, action: "view" | "download" | "copy_reference"): Promise<void>;
}
export class DocumentAttachmentConcurrencyError extends Error {
  constructor() {
    super("Esta referência foi alterada por outro usuário. Atualize os dados antes de salvar novamente.");
    this.name = "DocumentAttachmentConcurrencyError";
  }
}
