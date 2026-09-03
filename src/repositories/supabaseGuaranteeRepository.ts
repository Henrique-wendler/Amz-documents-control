import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type {
  GuaranteeInput,
  GuaranteeItemInput,
  GuaranteeItemRecord,
  GuaranteeRecord,
  GuaranteeTypeLink,
  GuaranteeTypeOption,
} from "../types/operacao";
import { toPostgresDate } from "./civilDate";
import type { GuaranteeRepository } from "./guaranteeRepository";
import { GuaranteeConcurrencyError, GuaranteeItemConcurrencyError } from "./guaranteeRepository";

interface GuaranteeRow {
  id: string; operation_id: string; description: string | null; degree: string | null; evaluation_year: number | null;
  status: GuaranteeRecord["status"]; start_date: string | null; end_date: string | null; notes: string | null;
  created_at: string; updated_at: string; version: number;
}
interface GuaranteeTypeLinkRow { guarantee_id: string; guarantee_type_id: string; is_primary: boolean; }
interface GuaranteeRegistrationRow { guarantee_id: string; registration_id: string; }
interface GuaranteeFinancialRow { guarantee_id: string; amount: number | string; version: number; }
interface GuaranteeItemRow {
  id: string; guarantee_id: string; category: string; description: string; quantity: number | string | null; unit: string | null;
  notes: string | null; created_at: string; updated_at: string; version: number;
}

const guaranteeSelection = "id, operation_id, description, degree, evaluation_year, status, start_date, end_date, notes, created_at, updated_at, version";
const itemSelection = "id, guarantee_id, category, description, quantity, unit, notes, created_at, updated_at, version";
const formatTimestamp = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Araguaina" }).format(new Date(value));

const friendlyError = (error: PostgrestError, fallback: string) => {
  if (error.code === "23505") return new Error("Revise os vínculos principais: somente uma relação pode ser marcada como principal.");
  if (error.code === "23503") return new Error("A operação, tipo ou matrícula informada não pertence à organização atual.");
  if (error.code === "23514") {
    if (/corresponding operation/i.test(error.message)) return new Error("A matrícula da garantia também deve estar vinculada à operação correspondente.");
    return new Error("Revise as datas, valores, quantidades e relações informadas para a garantia.");
  }
  if (error.code === "42501") return new Error("Você não possui permissão para realizar esta ação.");
  if (error.code === "40001") return new GuaranteeConcurrencyError();
  return new Error(fallback);
};

const currentOrganizationId = async () => {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Sua sessão não pôde ser validada. Entre novamente.");
  const { data, error } = await supabase.from("profiles").select("organization_id").eq("id", authData.user.id).eq("status", "active").maybeSingle();
  if (error || !data?.organization_id) throw new Error("Seu usuário não possui um perfil ativo para acessar o sistema.");
  return data.organization_id as string;
};

const transactionalArguments = (input: GuaranteeInput, canWriteFinancial: boolean) => ({
  p_operation_id: input.operationId,
  p_description: input.description?.trim() || null,
  p_degree: input.degree?.trim() || null,
  p_evaluation_year: input.evaluationYear ?? null,
  p_status: input.status,
  p_start_date: toPostgresDate(input.startDate),
  p_end_date: toPostgresDate(input.endDate),
  p_notes: input.notes?.trim() || null,
  p_guarantee_type_ids: [...new Set(input.guaranteeTypeIds)],
  p_primary_guarantee_type_id: input.primaryGuaranteeTypeId,
  p_registration_ids: [...new Set(input.registrationIds)],
  p_amount: canWriteFinancial ? input.amount ?? null : null,
  p_expected_financial_version: canWriteFinancial ? input.expectedFinancialVersion ?? null : null,
});

const mapItemInput = (input: GuaranteeItemInput) => ({
  guarantee_id: input.guaranteeId,
  category: input.category.trim(),
  description: input.description.trim(),
  quantity: input.quantity ?? null,
  unit: input.unit?.trim() || null,
  notes: input.notes?.trim() || null,
});

const mapItem = (row: GuaranteeItemRow): GuaranteeItemRecord => ({
  id: row.id,
  guaranteeId: row.guarantee_id,
  category: row.category,
  description: row.description,
  quantity: row.quantity === null ? undefined : Number(row.quantity),
  unit: row.unit ?? undefined,
  notes: row.notes ?? undefined,
  createdAt: formatTimestamp(row.created_at),
  updatedAt: formatTimestamp(row.updated_at),
  version: row.version,
});

const mapRows = (
  rows: GuaranteeRow[],
  typeLinks: GuaranteeTypeLinkRow[],
  registrationLinks: GuaranteeRegistrationRow[],
  financials: GuaranteeFinancialRow[],
): GuaranteeRecord[] => {
  const typesByGuarantee = new Map<string, GuaranteeTypeLink[]>();
  typeLinks.forEach((link) => typesByGuarantee.set(link.guarantee_id, [
    ...(typesByGuarantee.get(link.guarantee_id) ?? []),
    { guaranteeTypeId: link.guarantee_type_id, isPrimary: link.is_primary },
  ]));
  const registrationsByGuarantee = new Map<string, string[]>();
  registrationLinks.forEach((link) => registrationsByGuarantee.set(link.guarantee_id, [
    ...(registrationsByGuarantee.get(link.guarantee_id) ?? []), link.registration_id,
  ]));
  const financialByGuarantee = new Map(financials.map((financial) => [financial.guarantee_id, financial]));
  return rows.map((row) => {
    const financial = financialByGuarantee.get(row.id);
    return {
      id: row.id,
      operationId: row.operation_id,
      description: row.description ?? undefined,
      degree: row.degree ?? undefined,
      evaluationYear: row.evaluation_year ?? undefined,
      status: row.status,
      startDate: row.start_date ?? undefined,
      endDate: row.end_date ?? undefined,
      notes: row.notes ?? undefined,
      types: typesByGuarantee.get(row.id) ?? [],
      registrationIds: registrationsByGuarantee.get(row.id) ?? [],
      amount: financial === undefined ? undefined : Number(financial.amount),
      financialVersion: financial?.version,
      createdAt: formatTimestamp(row.created_at),
      updatedAt: formatTimestamp(row.updated_at),
      version: row.version,
    };
  });
};

const loadRelated = async (rows: GuaranteeRow[], includeFinancial: boolean) => {
  const ids = rows.map((row) => row.id);
  if (!ids.length) return [];
  const [typesResult, registrationsResult] = await Promise.all([
    supabase.from("guarantee_type_links").select("guarantee_id, guarantee_type_id, is_primary").in("guarantee_id", ids),
    supabase.from("guarantee_registrations").select("guarantee_id, registration_id").in("guarantee_id", ids),
  ]);
  if (typesResult.error) throw friendlyError(typesResult.error, "Não foi possível carregar os tipos das garantias.");
  if (registrationsResult.error) throw friendlyError(registrationsResult.error, "Não foi possível carregar as matrículas das garantias.");
  let financials: GuaranteeFinancialRow[] = [];
  if (includeFinancial) {
    const financialResult = await supabase.from("guarantee_financials").select("guarantee_id, amount, version").in("guarantee_id", ids);
    if (financialResult.error) throw friendlyError(financialResult.error, "Não foi possível carregar os valores das garantias.");
    financials = (financialResult.data ?? []) as unknown as GuaranteeFinancialRow[];
  }
  return mapRows(
    rows,
    (typesResult.data ?? []) as GuaranteeTypeLinkRow[],
    (registrationsResult.data ?? []) as GuaranteeRegistrationRow[],
    financials,
  );
};

const validateInput = (input: GuaranteeInput) => {
  const typeIds = [...new Set(input.guaranteeTypeIds)];
  const registrationIds = [...new Set(input.registrationIds)];
  if (!typeIds.length) throw new Error("Selecione ao menos um tipo para a garantia.");
  if (!typeIds.includes(input.primaryGuaranteeTypeId)) throw new Error("O tipo principal deve estar entre os tipos vinculados.");
  if (!registrationIds.length) throw new Error("Selecione ao menos uma matrícula para a garantia.");
  return { typeIds, registrationIds };
};

const queryGuarantees = async (filter?: { id?: string; operationId?: string }) => {
  let query = supabase.from("guarantees").select(guaranteeSelection).is("deleted_at", null).order("updated_at", { ascending: false });
  if (filter?.id) query = query.eq("id", filter.id);
  if (filter?.operationId) query = query.eq("operation_id", filter.operationId);
  const { data, error } = filter?.id ? await query.maybeSingle() : await query;
  if (error) throw friendlyError(error, "Não foi possível carregar as garantias.");
  if (filter?.id) return data ? [data as unknown as GuaranteeRow] : [];
  return (data ?? []) as unknown as GuaranteeRow[];
};

export const supabaseGuaranteeRepository: GuaranteeRepository = {
  async list(includeFinancial) { return loadRelated(await queryGuarantees(), includeFinancial); },
  async listByOperation(operationId, includeFinancial) { return loadRelated(await queryGuarantees({ operationId }), includeFinancial); },
  async getById(id, includeFinancial) { return (await loadRelated(await queryGuarantees({ id }), includeFinancial))[0]; },
  async listTypes(includeInactive = false): Promise<GuaranteeTypeOption[]> {
    let query = supabase.from("guarantee_types").select("id, name, status").is("deleted_at", null).order("name");
    if (!includeInactive) query = query.eq("status", "active");
    const { data, error } = await query;
    if (error) throw friendlyError(error, "Não foi possível carregar os tipos de garantia.");
    return (data ?? []).map((row) => ({ id: row.id as string, name: row.name as string, status: row.status as "active" | "inactive" }));
  },
  async create(input, canWriteFinancial) {
    validateInput(input);
    const { data, error } = await supabase.rpc("save_guarantee_transactional", {
      p_id: null,
      p_expected_version: null,
      ...transactionalArguments(input, canWriteFinancial),
    });
    if (error) throw friendlyError(error, "Não foi possível cadastrar a garantia.");
    const guaranteeId = data as string;
    const created = await this.getById(guaranteeId, canWriteFinancial);
    if (!created) throw new Error("Garantia cadastrada, mas não foi possível recarregá-la.");
    return created;
  },
  async update(id, expectedVersion, input, canWriteFinancial) {
    validateInput(input);
    const { data, error } = await supabase.rpc("save_guarantee_transactional", {
      p_id: id,
      p_expected_version: expectedVersion,
      ...transactionalArguments(input, canWriteFinancial),
    });
    if (error) throw friendlyError(error, "Não foi possível atualizar a garantia.");
    const guaranteeId = data as string;
    if (!guaranteeId) throw new GuaranteeConcurrencyError();
    const updated = await this.getById(guaranteeId, canWriteFinancial);
    if (!updated) throw new GuaranteeConcurrencyError();
    return updated;
  },
  async softDelete(id, expectedVersion) {
    const { data, error } = await supabase.rpc("soft_delete_record", { p_entity_type: "guarantees", p_id: id, p_expected_version: expectedVersion });
    if (error) throw friendlyError(error, "Não foi possível excluir a garantia.");
    if (data !== 1) throw new GuaranteeConcurrencyError();
  },
  async listItems(guaranteeIds) {
    if (guaranteeIds && !guaranteeIds.length) return [];
    let query = supabase.from("guarantee_items").select(itemSelection).is("deleted_at", null).order("updated_at", { ascending: false });
    if (guaranteeIds) query = query.in("guarantee_id", guaranteeIds);
    const { data, error } = await query;
    if (error) throw friendlyError(error, "Não foi possível carregar os itens das garantias.");
    return ((data ?? []) as unknown as GuaranteeItemRow[]).map(mapItem);
  },
  async createItem(input) {
    const organizationId = await currentOrganizationId();
    const { data, error } = await supabase.from("guarantee_items").insert({ organization_id: organizationId, ...mapItemInput(input) }).select(itemSelection).single();
    if (error) throw friendlyError(error, "Não foi possível cadastrar o item da garantia.");
    return mapItem(data as unknown as GuaranteeItemRow);
  },
  async updateItem(id, expectedVersion, input) {
    const { data, error } = await supabase.from("guarantee_items").update(mapItemInput(input)).eq("id", id).eq("version", expectedVersion).is("deleted_at", null).select(itemSelection).maybeSingle();
    if (error) throw friendlyError(error, "Não foi possível atualizar o item da garantia.");
    if (!data) throw new GuaranteeItemConcurrencyError();
    return mapItem(data as unknown as GuaranteeItemRow);
  },
  async softDeleteItem(id, expectedVersion) {
    const { data, error } = await supabase.rpc("soft_delete_record", { p_entity_type: "guarantee_items", p_id: id, p_expected_version: expectedVersion });
    if (error) throw friendlyError(error, "Não foi possível excluir o item da garantia.");
    if (data !== 1) throw new GuaranteeItemConcurrencyError();
  },
};
