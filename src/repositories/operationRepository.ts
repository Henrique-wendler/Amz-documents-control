import type { FinancialInstitutionOption, OperationInput, OperationRecord } from "../types/operacao";

export interface OperationRepository {
  list(includeFinancial: boolean): Promise<OperationRecord[]>;
  getById(id: string, includeFinancial: boolean): Promise<OperationRecord | undefined>;
  listInstitutions(includeInactive?: boolean): Promise<FinancialInstitutionOption[]>;
  create(input: OperationInput, writeFinancial: boolean): Promise<OperationRecord>;
  update(id: string, expectedVersion: number, input: OperationInput, writeFinancial: boolean): Promise<OperationRecord>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

export class OperationConcurrencyError extends Error {
  constructor() {
    super("Esta operação foi alterada por outro usuário. Atualize os dados antes de salvar novamente.");
    this.name = "OperationConcurrencyError";
  }
}
