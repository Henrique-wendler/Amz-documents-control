export interface PersistedDocumentType {
  id: string;
  name: string;
  code?: string;
  requiresExpiration?: boolean;
  version: number;
}

export interface DocumentTypeRepository {
  listActive(): Promise<PersistedDocumentType[]>;
  getById(id: string): Promise<PersistedDocumentType | undefined>;
}
