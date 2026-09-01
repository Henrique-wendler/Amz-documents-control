import { supabaseFarmRepository } from "../repositories/supabaseFarmRepository";
import { supabaseGuaranteeRepository } from "../repositories/supabaseGuaranteeRepository";
import { supabaseOperationRepository } from "../repositories/supabaseOperationRepository";
import { supabaseRegistrationRepository } from "../repositories/supabaseRegistrationRepository";
import type { GuaranteeInput, GuaranteeItemInput, GuaranteeItemRecord, GuaranteeRecord, OperationInput, OperationRecord, OperationRegistrationOption } from "../types/operacao";
import type { AppData, GuaranteeFormModel, GuaranteeFormStatus, GuaranteeItemFormModel, OperationFormModel, OperationFormStatus } from "../types/models";
import { formatCurrency } from "./searchUtils";
import { operationStatusLabels } from "./statusLabels";

export interface OperationFinancialAccess { readFinancial: boolean; writeFinancial: boolean; }

const operationStatusToDomain: Record<OperationFormStatus, OperationRecord["status"]> = {
  "Em análise": "under_review", Ativa: "active", Concluída: "completed", Cancelada: "cancelled",
};
const guaranteeStatusToUi: Record<GuaranteeRecord["status"], GuaranteeFormStatus> = { active: "Ativa", closed: "Encerrada", cancelled: "Cancelada" };
const guaranteeStatusToDomain: Record<GuaranteeFormStatus, GuaranteeRecord["status"]> = { Ativa: "active", Encerrada: "closed", Cancelada: "cancelled" };

const parseCurrency = (value: string) => {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Informe um valor financeiro válido.");
  return amount;
};

export const emptyOperationForm = (): OperationFormModel => ({
  id: "", version: 0, institutionId: "", registrationIds: [], primaryRegistrationId: "", matricula: "", banco: "",
  numero: "", finalidade: "", valor: "", situacao: "Em análise", dataInicio: "", dataFim: "", observacoes: "",
});
export const emptyGuaranteeForm = (operation?: OperationFormModel): GuaranteeFormModel => ({
  id: "", version: 0, operationId: operation?.id ?? "", guaranteeTypeIds: [], primaryGuaranteeTypeId: "", registrationIds: [],
  numeroOperacao: operation?.numero ?? "", matricula: "", fazenda: "", banco: operation?.banco ?? "", tipo: "", descricao: "",
  grau: "", valor: "", anoAvaliacao: "", situacao: "Ativa", dataInicio: "", dataVencimento: "", observacoes: "",
});
export const emptyGuaranteeItemForm = (guaranteeId = ""): GuaranteeItemFormModel => ({
  id: "", version: 0, guaranteeId, categoria: "", descricao: "", quantidade: 0, unidade: "", observacoes: "",
});

const registrationOptions = async (): Promise<OperationRegistrationOption[]> => {
  const [registrations, farms] = await Promise.all([supabaseRegistrationRepository.list(), supabaseFarmRepository.list()]);
  const farmById = new Map(farms.map((farm) => [farm.id, farm]));
  return registrations.filter((registration) => registration.status === "active").map((registration) => {
    const farm = farmById.get(registration.farmId);
    return { id: registration.id, number: registration.number, farmId: registration.farmId, farmName: farm?.name ?? "Fazenda não encontrada", label: `${registration.number} — ${farm?.name ?? "Fazenda não encontrada"}` };
  }).sort((left, right) => left.label.localeCompare(right.label, "pt-BR", { numeric: true }));
};

const toOperationForm = (operation: OperationRecord, registrations: OperationRegistrationOption[], institutions: Awaited<ReturnType<typeof supabaseOperationRepository.listInstitutions>>): OperationFormModel => {
  const registrationById = new Map(registrations.map((registration) => [registration.id, registration]));
  const registrationIds = operation.registrations.map((link) => link.registrationId);
  return {
    id: operation.id, version: operation.version, financialVersion: operation.financialVersion, institutionId: operation.institutionId,
    registrationIds, primaryRegistrationId: operation.registrations.find((link) => link.isPrimary)?.registrationId ?? registrationIds[0] ?? "",
    matricula: registrationIds.map((id) => registrationById.get(id)?.number).filter(Boolean).join(", "),
    banco: institutions.find((item) => item.id === operation.institutionId)?.name ?? "Instituição não encontrada",
    numero: operation.operationNumber, finalidade: operation.purpose ?? "", valor: operation.amount === undefined ? "" : formatCurrency(operation.amount),
    situacao: operationStatusLabels[operation.status], dataInicio: operation.startDate ?? "", dataFim: operation.endDate ?? "", observacoes: operation.notes ?? "",
  };
};

const toGuaranteeForm = (guarantee: GuaranteeRecord, operation: OperationFormModel, registrations: OperationRegistrationOption[], guaranteeTypes: Awaited<ReturnType<typeof supabaseGuaranteeRepository.listTypes>>): GuaranteeFormModel => {
  const registrationById = new Map(registrations.map((registration) => [registration.id, registration]));
  const typeById = new Map(guaranteeTypes.map((type) => [type.id, type]));
  const typeIds = guarantee.types.map((link) => link.guaranteeTypeId);
  const linkedRegistrations = guarantee.registrationIds.map((id) => registrationById.get(id)).filter((item): item is OperationRegistrationOption => Boolean(item));
  return {
    id: guarantee.id, version: guarantee.version, financialVersion: guarantee.financialVersion, operationId: guarantee.operationId,
    guaranteeTypeIds: typeIds, primaryGuaranteeTypeId: guarantee.types.find((link) => link.isPrimary)?.guaranteeTypeId ?? typeIds[0] ?? "",
    registrationIds: guarantee.registrationIds, numeroOperacao: operation.numero, matricula: linkedRegistrations.map((registration) => registration.number).join(", "),
    fazenda: [...new Set(linkedRegistrations.map((registration) => registration.farmName))].join(", "), banco: operation.banco,
    tipo: typeIds.map((id) => typeById.get(id)?.name).filter(Boolean).join(", "), descricao: guarantee.description ?? "", grau: guarantee.degree ?? "",
    valor: guarantee.amount === undefined ? "" : formatCurrency(guarantee.amount), anoAvaliacao: guarantee.evaluationYear ? String(guarantee.evaluationYear) : "",
    situacao: guaranteeStatusToUi[guarantee.status], dataInicio: guarantee.startDate ?? "", dataVencimento: guarantee.endDate ?? "", observacoes: guarantee.notes ?? "",
  };
};

const toItemForm = (item: GuaranteeItemRecord): GuaranteeItemFormModel => ({
  id: item.id, version: item.version, guaranteeId: item.guaranteeId, categoria: item.category, descricao: item.description,
  quantidade: item.quantity ?? 0, unidade: item.unit ?? "", observacoes: item.notes ?? "",
});

const toOperationInput = (value: OperationFormModel, access: OperationFinancialAccess): OperationInput => ({
  operationNumber: value.numero.trim(), institutionId: value.institutionId, purpose: value.finalidade.trim() || undefined,
  status: operationStatusToDomain[value.situacao], startDate: value.dataInicio || undefined, endDate: value.dataFim || undefined,
  notes: value.observacoes.trim() || undefined, registrationIds: value.registrationIds, primaryRegistrationId: value.primaryRegistrationId,
  amount: access.readFinancial && access.writeFinancial ? parseCurrency(value.valor || "0") : undefined, expectedFinancialVersion: value.financialVersion,
});
const toGuaranteeInput = (value: GuaranteeFormModel, access: OperationFinancialAccess): GuaranteeInput => ({
  operationId: value.operationId, description: value.descricao.trim() || undefined, degree: value.grau.trim() || undefined,
  evaluationYear: value.anoAvaliacao ? Number(value.anoAvaliacao) : undefined, status: guaranteeStatusToDomain[value.situacao],
  startDate: value.dataInicio || undefined, endDate: value.dataVencimento || undefined, notes: value.observacoes.trim() || undefined,
  guaranteeTypeIds: value.guaranteeTypeIds, primaryGuaranteeTypeId: value.primaryGuaranteeTypeId, registrationIds: value.registrationIds,
  amount: access.readFinancial && access.writeFinancial ? parseCurrency(value.valor || "0") : undefined, expectedFinancialVersion: value.financialVersion,
});
const toItemInput = (value: GuaranteeItemFormModel): GuaranteeItemInput => ({
  guaranteeId: value.guaranteeId, category: value.categoria, description: value.descricao, quantity: value.quantidade,
  unit: value.unidade || undefined, notes: value.observacoes || undefined,
});
const requestedId = (key: "id" | "garantia") => new URLSearchParams(window.location.search).get(key) ?? undefined;

export const operationService = {
  async load(access: OperationFinancialAccess, operationId = requestedId("id")): Promise<AppData> {
    const [operations, institutions, registrations, guaranteeTypes] = await Promise.all([
      supabaseOperationRepository.list(access.readFinancial), supabaseOperationRepository.listInstitutions(), registrationOptions(), supabaseGuaranteeRepository.listTypes(),
    ]);
    const selectedOperation = operations.find((item) => item.id === operationId) ?? operations[0];
    if (!selectedOperation) return { operation: emptyOperationForm(), operations: [], guarantees: [], items: [], institutions, registrations, guaranteeTypes };
    const operation = toOperationForm(selectedOperation, registrations, institutions);
    const guarantees = await supabaseGuaranteeRepository.listByOperation(selectedOperation.id, access.readFinancial);
    const requestedGuaranteeId = requestedId("garantia");
    const orderedGuarantees = requestedGuaranteeId ? [...guarantees].sort((left, right) => Number(right.id === requestedGuaranteeId) - Number(left.id === requestedGuaranteeId)) : guarantees;
    const items = await supabaseGuaranteeRepository.listItems(orderedGuarantees.map((guarantee) => guarantee.id));
    return {
      operation,
      operations: operations.map((item) => ({ id: item.id, label: `${item.operationNumber} — ${institutions.find((institution) => institution.id === item.institutionId)?.name ?? "Instituição não encontrada"}` })),
      guarantees: orderedGuarantees.map((guarantee) => toGuaranteeForm(guarantee, operation, registrations, guaranteeTypes)),
      items: items.map(toItemForm), institutions, registrations, guaranteeTypes,
    };
  },
  async saveOperation(value: OperationFormModel, access: OperationFinancialAccess) {
    if (!value.numero.trim() || !value.institutionId) throw new Error("Informe o número e a instituição da operação.");
    const input = toOperationInput(value, access);
    const saved = value.id
      ? await supabaseOperationRepository.update(value.id, value.version, input, access.writeFinancial && access.readFinancial)
      : await supabaseOperationRepository.create(input, access.writeFinancial && access.readFinancial);
    const [registrations, institutions] = await Promise.all([registrationOptions(), supabaseOperationRepository.listInstitutions()]);
    return toOperationForm(saved, registrations, institutions);
  },
  async deleteOperation(id: string, expectedVersion: number) {
    if ((await supabaseGuaranteeRepository.listByOperation(id, false)).length) return { deleted: false as const, reason: "linked" as const };
    await supabaseOperationRepository.softDelete(id, expectedVersion);
    return { deleted: true as const };
  },
  async saveGuarantee(value: GuaranteeFormModel, access: OperationFinancialAccess) {
    const input = toGuaranteeInput(value, access);
    const saved = value.id
      ? await supabaseGuaranteeRepository.update(value.id, value.version, input, access.writeFinancial && access.readFinancial)
      : await supabaseGuaranteeRepository.create(input, access.writeFinancial && access.readFinancial);
    const operation = await supabaseOperationRepository.getById(saved.operationId, access.readFinancial);
    if (!operation) throw new Error("Operação da garantia não encontrada.");
    const [registrations, institutions, guaranteeTypes] = await Promise.all([registrationOptions(), supabaseOperationRepository.listInstitutions(), supabaseGuaranteeRepository.listTypes()]);
    return toGuaranteeForm(saved, toOperationForm(operation, registrations, institutions), registrations, guaranteeTypes);
  },
  async closeGuarantee(value: GuaranteeFormModel, access: OperationFinancialAccess) { return this.saveGuarantee({ ...value, situacao: "Encerrada" }, access); },
  async deleteGuarantee(id: string, expectedVersion: number) {
    if ((await supabaseGuaranteeRepository.listItems([id])).length) return { deleted: false as const, reason: "linked" as const };
    await supabaseGuaranteeRepository.softDelete(id, expectedVersion);
    return { deleted: true as const };
  },
  async saveGuaranteeItem(value: GuaranteeItemFormModel) {
    if (!value.guaranteeId || !value.categoria.trim() || !value.descricao.trim()) throw new Error("Informe a categoria e a descrição do item.");
    const saved = value.id
      ? await supabaseGuaranteeRepository.updateItem(value.id, value.version, toItemInput(value))
      : await supabaseGuaranteeRepository.createItem(toItemInput(value));
    return toItemForm(saved);
  },
  async deleteGuaranteeItem(id: string, expectedVersion: number) { await supabaseGuaranteeRepository.softDeleteItem(id, expectedVersion); },
  async listRecords(includeFinancial = false) {
    const [operations, guarantees, items, institutions, registrations, guaranteeTypes] = await Promise.all([
      supabaseOperationRepository.list(includeFinancial), supabaseGuaranteeRepository.list(includeFinancial), supabaseGuaranteeRepository.listItems(),
      supabaseOperationRepository.listInstitutions(), registrationOptions(), supabaseGuaranteeRepository.listTypes(),
    ]);
    return { operations, guarantees, items, institutions, registrations, guaranteeTypes };
  },
  async listRelatedViews() {
    const data = await this.listRecords(false);
    const institutionById = new Map(data.institutions.map((item) => [item.id, item.name]));
    const typeById = new Map(data.guaranteeTypes.map((item) => [item.id, item.name]));
    return {
      operations: data.operations.map((operation) => ({
        id: operation.id,
        operationNumber: operation.operationNumber,
        institutionName: institutionById.get(operation.institutionId) ?? "Instituição não encontrada",
        purpose: operation.purpose,
        status: operation.status,
        registrationIds: operation.registrations.map((item) => item.registrationId),
        primaryRegistrationId: operation.registrations.find((item) => item.isPrimary)?.registrationId,
      })),
      guarantees: data.guarantees.map((guarantee) => ({
        id: guarantee.id,
        operationId: guarantee.operationId,
        typeNames: guarantee.types.map((item) => typeById.get(item.guaranteeTypeId)).filter((name): name is string => Boolean(name)),
        primaryTypeName: typeById.get(guarantee.types.find((item) => item.isPrimary)?.guaranteeTypeId ?? ""),
        status: guarantee.status,
        registrationIds: guarantee.registrationIds,
      })),
    };
  },
};
