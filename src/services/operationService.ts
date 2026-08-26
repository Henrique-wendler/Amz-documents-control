import { mockStore } from "../data/mock/mockStore";
import { getGuaranteeItems, getGuaranteesByOperation } from "../data/mock/selectors";
import type { Guarantee, GuaranteeItem, Operation } from "../types/domain";
import type { AppData, GuaranteeFormModel, GuaranteeFormStatus, GuaranteeItemFormModel, OperationFormModel, OperationFormStatus } from "../types/models";
import { formatCurrency } from "./searchUtils";

const operationStatusToUi: Record<Operation["status"], OperationFormStatus> = {
  under_review: "Em análise", active: "Ativa", completed: "Concluída", cancelled: "Cancelada",
};
const operationStatusToDomain: Record<OperationFormStatus, Operation["status"]> = {
  "Em análise": "under_review", Ativa: "active", Concluída: "completed", Cancelada: "cancelled",
};
const guaranteeStatusToUi: Record<Guarantee["status"], GuaranteeFormStatus> = {
  active: "Ativa", closed: "Encerrada", cancelled: "Cancelada",
};
const guaranteeStatusToDomain: Record<GuaranteeFormStatus, Guarantee["status"]> = {
  Ativa: "active", Encerrada: "closed", "Em análise": "active", Cancelada: "cancelled",
};
const parseCurrency = (value: string) => Number(value.replace(/[^\d,]/g, "").replace(",", ".")) || 0;

const toOperationForm = (operation: Operation): OperationFormModel => {
  const registration = operation.registrationId ? mockStore.getState().registrations.find((item) => item.id === operation.registrationId) : undefined;
  return { id: operation.id, matricula: registration?.number ?? "", banco: operation.bank, numero: operation.number, finalidade: operation.purpose ?? "", valor: formatCurrency(operation.value), situacao: operationStatusToUi[operation.status], dataInicio: operation.startDate ?? "" };
};

const toGuaranteeForm = (guarantee: Guarantee): GuaranteeFormModel => {
  const db = mockStore.getState();
  const operation = db.operations.find((item) => item.id === guarantee.operationId);
  const registration = db.registrations.find((item) => item.id === guarantee.registrationId);
  const farm = registration ? db.farms.find((item) => item.id === registration.farmId) : undefined;
  return {
    id: guarantee.id, numeroOperacao: operation?.number ?? "", matricula: registration?.number ?? "", fazenda: farm?.name ?? "",
    banco: guarantee.bank ?? operation?.bank ?? "", tipo: guarantee.type, descricao: guarantee.description ?? "", grau: guarantee.degree ?? "",
    valor: formatCurrency(guarantee.value ?? 0), anoAvaliacao: guarantee.evaluationYear ? String(guarantee.evaluationYear) : "",
    situacao: guaranteeStatusToUi[guarantee.status], dataInicio: guarantee.startDate ?? "", dataVencimento: guarantee.endDate ?? "", observacoes: guarantee.notes ?? "",
  };
};

const toItemForm = (item: GuaranteeItem): GuaranteeItemFormModel => ({
  id: item.id, guaranteeId: item.guaranteeId, categoria: item.category, descricao: item.description,
  quantidade: item.quantity ?? 0, unidade: item.unit ?? "", observacoes: item.notes ?? "",
});

const resolveOperation = (value: OperationFormModel): Operation => {
  const db = mockStore.getState();
  const registration = db.registrations.find((item) => item.number === value.matricula);
  const existing = db.operations.find((item) => item.id === value.id);
  if (!registration) throw new Error("Matrícula não encontrada na base simulada.");
  return {
    id: existing?.id ?? value.id, farmId: registration.farmId, registrationId: registration.id,
    number: value.numero, bank: value.banco, purpose: value.finalidade, value: parseCurrency(value.valor),
    status: operationStatusToDomain[value.situacao], startDate: value.dataInicio,
    createdAt: existing?.createdAt ?? "", updatedAt: existing?.updatedAt ?? "",
  };
};

const resolveGuarantee = (value: GuaranteeFormModel): Guarantee => {
  const db = mockStore.getState();
  const operation = db.operations.find((item) => item.number === value.numeroOperacao);
  const registration = db.registrations.find((item) => item.number === value.matricula);
  const existing = db.guarantees.find((item) => item.id === value.id);
  if (!operation || !registration) throw new Error("Operação ou matrícula não encontrada na base simulada.");
  return {
    id: existing?.id ?? value.id, operationId: operation.id, registrationId: registration.id, bank: value.banco,
    type: value.tipo, description: value.descricao, degree: value.grau, value: parseCurrency(value.valor),
    evaluationYear: Number(value.anoAvaliacao) || undefined, status: guaranteeStatusToDomain[value.situacao],
    startDate: value.dataInicio, endDate: value.dataVencimento, notes: value.observacoes,
    createdAt: existing?.createdAt ?? "", updatedAt: existing?.updatedAt ?? "",
  };
};

const resolveItem = (value: GuaranteeItemFormModel): GuaranteeItem => {
  const existing = mockStore.getState().guaranteeItems.find((item) => item.id === value.id);
  return {
    id: existing?.id ?? value.id, guaranteeId: value.guaranteeId, category: value.categoria, description: value.descricao,
    quantity: value.quantidade, unit: value.unidade, notes: value.observacoes,
    createdAt: existing?.createdAt ?? "", updatedAt: existing?.updatedAt ?? "",
  };
};

const currentOperationId = () => {
  const requested = new URLSearchParams(window.location.search).get("id");
  return requested?.startsWith("OP-") ? requested : "OP-001";
};

export const operationService = {
  async load(operationId = currentOperationId()): Promise<AppData> {
    const db = mockStore.getState();
    const operation = db.operations.find((item) => item.id === operationId) ?? db.operations[0];
    if (!operation) throw new Error("Nenhuma operação disponível.");
    const guarantees = getGuaranteesByOperation(operation.id, db);
    const requestedGuarantee = new URLSearchParams(window.location.search).get("garantia");
    const orderedGuarantees = requestedGuarantee ? [...guarantees].sort((left) => left.id === requestedGuarantee ? -1 : 1) : guarantees;
    return {
      operation: toOperationForm(operation),
      guarantees: orderedGuarantees.map(toGuaranteeForm),
      items: orderedGuarantees.flatMap((guarantee) => getGuaranteeItems(guarantee.id, db)).map(toItemForm),
    };
  },
  async saveOperation(value: OperationFormModel) {
    return toOperationForm(mockStore.saveOperation(resolveOperation(value)));
  },
  async deleteOperation(id: string) {
    mockStore.deleteOperation(id);
  },
  async saveGuarantee(value: GuaranteeFormModel) {
    return toGuaranteeForm(mockStore.saveGuarantee(resolveGuarantee(value)));
  },
  async closeGuarantee(id: string) {
    const current = mockStore.getState().guarantees.find((item) => item.id === id);
    if (!current) throw new Error("Garantia não encontrada.");
    return toGuaranteeForm(mockStore.saveGuarantee({ ...current, status: "closed" }));
  },
  async deleteGuarantee(id: string) {
    mockStore.deleteGuarantee(id);
  },
  async saveGuaranteeItem(value: GuaranteeItemFormModel) {
    return toItemForm(mockStore.saveGuaranteeItem(resolveItem(value)));
  },
  async deleteGuaranteeItem(id: string) {
    mockStore.deleteGuaranteeItem(id);
  },
};

