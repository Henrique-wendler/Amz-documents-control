import type { OwnershipLink } from "../types/domain";

export interface PersistedOwnershipLink extends OwnershipLink {
  version: number;
  endDate?: string;
}

export interface OwnershipRepositoryInput {
  ownerId: string;
  type: OwnershipLink["type"];
  percentage?: number;
  status: OwnershipLink["status"];
  startDate?: string;
  endDate?: string;
}

export interface OwnershipRepository {
  list(): Promise<PersistedOwnershipLink[]>;
  listByRegistration(registrationId: string): Promise<PersistedOwnershipLink[]>;
  listByOwner(ownerId: string): Promise<PersistedOwnershipLink[]>;
  getById(id: string): Promise<PersistedOwnershipLink | undefined>;
  create(registrationId: string, input: OwnershipRepositoryInput): Promise<PersistedOwnershipLink>;
  update(id: string, expectedVersion: number, input: OwnershipRepositoryInput): Promise<PersistedOwnershipLink>;
  close(id: string, expectedVersion: number): Promise<PersistedOwnershipLink>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

export class OwnershipConcurrencyError extends Error {
  constructor() {
    super("Este vínculo foi alterado por outro usuário. Atualize os dados antes de salvar novamente.");
    this.name = "OwnershipConcurrencyError";
  }
}

