import type { DocumentValidityStatus, EntityStatus, RuralDocument } from "../types/domain";

export interface PersistedDocument extends RuralDocument {
  documentTypeId: string;
  version: number;
  validityStatus: DocumentValidityStatus;
}

export interface DocumentRepositoryInput {
  farmId: string;
  registrationId?: string;
  documentTypeId: string;
  documentNumber?: string;
  exerciseYear?: number;
  issueDate?: string;
  expirationDate?: string;
  purpose?: string;
  licensedArea?: number;
  sigamStatus?: string;
  status: EntityStatus;
  notes?: string;
}

export interface DocumentRepository {
  list(): Promise<PersistedDocument[]>;
  listByFarm(farmId: string): Promise<PersistedDocument[]>;
  listByRegistration(registrationId: string): Promise<PersistedDocument[]>;
  getById(id: string): Promise<PersistedDocument | undefined>;
  create(input: DocumentRepositoryInput): Promise<PersistedDocument>;
  update(id: string, expectedVersion: number, input: DocumentRepositoryInput): Promise<PersistedDocument>;
  inactivate(id: string, expectedVersion: number): Promise<PersistedDocument>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

export class DocumentConcurrencyError extends Error {
  constructor() {
    super("Este documento foi alterado por outro usuário. Atualize os dados antes de salvar novamente.");
    this.name = "DocumentConcurrencyError";
  }
}
