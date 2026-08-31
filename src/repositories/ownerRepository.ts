import type { EntityStatus, Owner } from "../types/domain";

export interface PersistedOwner extends Owner {
  version: number;
}

export interface OwnerRepositoryFilters {
  query: string;
  type: "all" | Owner["type"];
  status: "all" | EntityStatus;
  page: number;
  pageSize: number;
}

export interface OwnerRepositorySummary {
  total: number;
  individuals: number;
  companies: number;
  inactive: number;
}

export interface OwnerRepositoryPage {
  records: PersistedOwner[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: OwnerRepositorySummary;
}

export interface OwnerRepositoryInput {
  type: Owner["type"];
  name: string;
  documentNumber: string;
  phone?: string;
  email?: string;
  status: EntityStatus;
  notes?: string;
}

export interface OwnerRepository {
  list(filters: OwnerRepositoryFilters): Promise<OwnerRepositoryPage>;
  getById(id: string): Promise<PersistedOwner | undefined>;
  create(input: OwnerRepositoryInput): Promise<PersistedOwner>;
  update(id: string, expectedVersion: number, input: OwnerRepositoryInput): Promise<PersistedOwner>;
  inactivate(id: string, expectedVersion: number): Promise<PersistedOwner>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

export class OwnerConcurrencyError extends Error {
  constructor() {
    super("Este registro foi alterado por outro usuário. Atualize os dados antes de salvar novamente.");
    this.name = "OwnerConcurrencyError";
  }
}
