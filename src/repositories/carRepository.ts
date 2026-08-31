import type { CarRecord } from "../types/domain";

export interface PersistedCarRecord extends CarRecord { version: number; declaredOwnerName?: string; notes?: string; }
export interface CarRepositoryInput {
  farmId: string;
  registrationId?: string;
  carNumber: string;
  receiptNumber?: string;
  declaredOwnerName?: string;
  status: CarRecord["status"];
  notes?: string;
}
export interface CarRepository {
  list(): Promise<PersistedCarRecord[]>;
  listByFarm(farmId: string): Promise<PersistedCarRecord[]>;
  listByRegistration(registrationId: string): Promise<PersistedCarRecord[]>;
  getById(id: string): Promise<PersistedCarRecord | undefined>;
  create(input: CarRepositoryInput): Promise<PersistedCarRecord>;
  update(id: string, expectedVersion: number, input: CarRepositoryInput): Promise<PersistedCarRecord>;
  inactivate(id: string, expectedVersion: number): Promise<PersistedCarRecord>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}
export class CarConcurrencyError extends Error {
  constructor() {
    super("Este CAR foi alterado por outro usuário. Atualize os dados antes de salvar novamente.");
    this.name = "CarConcurrencyError";
  }
}
