import type { EntityStatus, Farm } from "../types/domain";

export interface PersistedFarm extends Farm {
  version: number;
}

export interface FarmRepositoryInput {
  name: string;
  municipality: string;
  state: string;
  location?: string;
  totalArea: number;
  reserveArea?: number;
  consolidatedArea?: number;
  status: EntityStatus;
  notes?: string;
}

export interface FarmRepository {
  list(): Promise<PersistedFarm[]>;
  getById(id: string): Promise<PersistedFarm | undefined>;
  getByIds(ids: string[]): Promise<PersistedFarm[]>;
  create(input: FarmRepositoryInput): Promise<PersistedFarm>;
  update(id: string, expectedVersion: number, input: FarmRepositoryInput): Promise<PersistedFarm>;
  inactivate(id: string, expectedVersion: number): Promise<PersistedFarm>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

export class FarmConcurrencyError extends Error {
  constructor() {
    super("Esta fazenda foi alterada por outro usuário. Atualize os dados antes de salvar novamente.");
    this.name = "FarmConcurrencyError";
  }
}

