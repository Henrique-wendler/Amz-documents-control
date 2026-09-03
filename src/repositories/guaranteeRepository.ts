import type { GuaranteeInput, GuaranteeItemInput, GuaranteeItemRecord, GuaranteeRecord, GuaranteeTypeOption } from "../types/operacao";

export interface GuaranteeRepository {
  list(includeFinancial: boolean): Promise<GuaranteeRecord[]>;
  listByOperation(operationId: string, includeFinancial: boolean): Promise<GuaranteeRecord[]>;
  getById(id: string, includeFinancial: boolean): Promise<GuaranteeRecord | undefined>;
  listTypes(includeInactive?: boolean): Promise<GuaranteeTypeOption[]>;
  create(input: GuaranteeInput, writeFinancial: boolean): Promise<GuaranteeRecord>;
  update(id: string, expectedVersion: number, input: GuaranteeInput, writeFinancial: boolean): Promise<GuaranteeRecord>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
  listItems(guaranteeIds?: string[]): Promise<GuaranteeItemRecord[]>;
  createItem(input: GuaranteeItemInput): Promise<GuaranteeItemRecord>;
  updateItem(id: string, expectedVersion: number, input: GuaranteeItemInput): Promise<GuaranteeItemRecord>;
  softDeleteItem(id: string, expectedVersion: number): Promise<void>;
}

export class GuaranteeConcurrencyError extends Error {
  constructor() {
    super("Esta garantia foi alterada por outro usuário. Atualize os dados antes de salvar novamente.");
    this.name = "GuaranteeConcurrencyError";
  }
}

export class GuaranteeItemConcurrencyError extends Error {
  constructor() {
    super("Este item foi alterado por outro usuário. Atualize os dados antes de salvar novamente.");
    this.name = "GuaranteeItemConcurrencyError";
  }
}
