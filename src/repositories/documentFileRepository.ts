import type { PersistedDocumentAttachment } from "./documentAttachmentRepository";

export interface FileUploadResult {
  attachment: PersistedDocumentAttachment;
  checksum: string;
}

export interface DocumentFileRepository {
  upload(documentId: string, file: File): Promise<FileUploadResult>;
  download(locationId: string): Promise<{ signedUrl: string; fileName: string; expiresIn: number }>;
  removeLocation(locationId: string, expectedVersion: number): Promise<void>;
}
