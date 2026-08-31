import type { EntityStatus, Registration } from "../types/domain";

export interface PersistedRegistration extends Registration {
  version: number;
}

export interface RegistrationRepositoryInput {
  farmId: string;
  number: string;
  previousNumber?: string;
  legalArea?: number;
  certificateDate?: string;
  status: EntityStatus;
}

export interface RegistrationRepository {
  list(): Promise<PersistedRegistration[]>;
  listByFarm(farmId: string): Promise<PersistedRegistration[]>;
  getById(id: string): Promise<PersistedRegistration | undefined>;
  getByIds(ids: string[]): Promise<PersistedRegistration[]>;
  create(input: RegistrationRepositoryInput): Promise<PersistedRegistration>;
  update(id: string, expectedVersion: number, input: RegistrationRepositoryInput): Promise<PersistedRegistration>;
  inactivate(id: string, expectedVersion: number): Promise<PersistedRegistration>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

export class RegistrationConcurrencyError extends Error {
  constructor() {
    super("Esta matrícula foi alterada por outro usuário. Atualize os dados antes de salvar novamente.");
    this.name = "RegistrationConcurrencyError";
  }
}

