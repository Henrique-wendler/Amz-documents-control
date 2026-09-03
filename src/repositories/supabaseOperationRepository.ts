import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { OperationInput, OperationRecord, OperationRegistrationLink } from "../types/operacao";
import { toPostgresDate } from "./civilDate";
import type { OperationRepository } from "./operationRepository";
import { OperationConcurrencyError } from "./operationRepository";

interface OperationRow {
  id: string;
  operation_number: string;
  institution_id: string;
  purpose: string | null;
  status: OperationRecord["status"];
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

interface OperationRegistrationRow { operation_id: string; registration_id: string; is_primary: boolean; }
interface OperationFinancialRow { operation_id: string; amount: number | string; version: number; }

const operationSelection = "id, operation_number, institution_id, purpose, status, start_date, end_date, notes, created_at, updated_at, version";
const formatTimestamp = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Araguaina" }).format(new Date(value));

const friendlyError = (error: PostgrestError, fallback: string) => {
  if (error.code === "23505") return new Error("Já existe uma operação com este número nesta organização.");
  if (error.code === "23503") return new Error("A instituição ou matrícula informada não pertence à organização atual, ou ainda está vinculada a uma garantia.");
  if (error.code === "23514") return new Error("Revise as datas, valores e relações informadas para a operação.");
  if (error.code === "42501") return new Error("Você não possui permissão para realizar esta ação.");
  if (error.code === "40001") return new OperationConcurrencyError();
  return new Error(fallback);
};

const transactionalArguments = (input: OperationInput, canWriteFinancial: boolean) => ({
  p_operation_number: input.operationNumber.trim(),
  p_institution_id: input.institutionId,
  p_purpose: input.purpose?.trim() || null,
  p_status: input.status,
  p_start_date: toPostgresDate(input.startDate),
  p_end_date: toPostgresDate(input.endDate),
  p_notes: input.notes?.trim() || null,
  p_registration_ids: [...new Set(input.registrationIds)],
  p_primary_registration_id: input.primaryRegistrationId,
  p_amount: canWriteFinancial ? input.amount ?? null : null,
  p_expected_financial_version: canWriteFinancial ? input.expectedFinancialVersion ?? null : null,
});

const mapRows = (
  rows: OperationRow[],
  registrations: OperationRegistrationRow[],
  financials: OperationFinancialRow[],
): OperationRecord[] => {
  const registrationByOperation = new Map<string, OperationRegistrationLink[]>();
  for (const link of registrations) {
    registrationByOperation.set(link.operation_id, [
      ...(registrationByOperation.get(link.operation_id) ?? []),
      { registrationId: link.registration_id, isPrimary: link.is_primary },
    ]);
  }
  const financialByOperation = new Map(financials.map((financial) => [financial.operation_id, financial]));
  return rows.map((row) => {
    const financial = financialByOperation.get(row.id);
    return {
      id: row.id,
      operationNumber: row.operation_number,
      institutionId: row.institution_id,
      purpose: row.purpose ?? undefined,
      status: row.status,
      startDate: row.start_date ?? undefined,
      endDate: row.end_date ?? undefined,
      notes: row.notes ?? undefined,
      registrations: registrationByOperation.get(row.id) ?? [],
      amount: financial === undefined ? undefined : Number(financial.amount),
      financialVersion: financial?.version,
      createdAt: formatTimestamp(row.created_at),
      updatedAt: formatTimestamp(row.updated_at),
      version: row.version,
    };
  });
};

const loadRelated = async (rows: OperationRow[], includeFinancial: boolean) => {
  const ids = rows.map((row) => row.id);
  if (!ids.length) return [];
  const registrationResult = await supabase
    .from("operation_registrations")
    .select("operation_id, registration_id, is_primary")
    .in("operation_id", ids);
  if (registrationResult.error) throw friendlyError(registrationResult.error, "Não foi possível carregar as matrículas das operações.");

  let financials: OperationFinancialRow[] = [];
  if (includeFinancial) {
    const financialResult = await supabase
      .from("operation_financials")
      .select("operation_id, amount, version")
      .in("operation_id", ids);
    if (financialResult.error) throw friendlyError(financialResult.error, "Não foi possível carregar os valores das operações.");
    financials = (financialResult.data ?? []) as unknown as OperationFinancialRow[];
  }
  return mapRows(rows, (registrationResult.data ?? []) as OperationRegistrationRow[], financials);
};

const validateRegistrations = (input: OperationInput) => {
  const uniqueIds = [...new Set(input.registrationIds)];
  if (!uniqueIds.length) throw new Error("Selecione ao menos uma matrícula para a operação.");
  if (!uniqueIds.includes(input.primaryRegistrationId)) throw new Error("A matrícula principal deve estar entre as matrículas vinculadas.");
  return uniqueIds;
};

const queryOperations = async (id?: string) => {
  let query = supabase.from("operations").select(operationSelection).is("deleted_at", null).order("updated_at", { ascending: false });
  if (id) query = query.eq("id", id);
  const { data, error } = id ? await query.maybeSingle() : await query;
  if (error) throw friendlyError(error, "Não foi possível carregar as operações.");
  if (id) return data ? [data as unknown as OperationRow] : [];
  return (data ?? []) as unknown as OperationRow[];
};

export const supabaseOperationRepository: OperationRepository = {
  async list(includeFinancial) {
    return loadRelated(await queryOperations(), includeFinancial);
  },
  async getById(id, includeFinancial) {
    return (await loadRelated(await queryOperations(id), includeFinancial))[0];
  },
  async listInstitutions(includeInactive = false) {
    let query = supabase
      .from("financial_institutions")
      .select("id, name, short_name, status")
      .is("deleted_at", null)
      .order("name");
    if (!includeInactive) query = query.eq("status", "active");
    const { data, error } = await query;
    if (error) throw friendlyError(error, "Não foi possível carregar as instituições financeiras.");
    return (data ?? []).map((row) => ({ id: row.id as string, name: row.name as string, shortName: (row.short_name as string | null) ?? undefined, status: row.status as "active" | "inactive" }));
  },
  async create(input, canWriteFinancial) {
    validateRegistrations(input);
    const { data, error } = await supabase.rpc("save_operation_transactional", {
      p_id: null,
      p_expected_version: null,
      ...transactionalArguments(input, canWriteFinancial),
    });
    if (error) throw friendlyError(error, "Não foi possível cadastrar a operação.");
    const operationId = data as string;
    const created = await this.getById(operationId, canWriteFinancial);
    if (!created) throw new Error("Operação cadastrada, mas não foi possível recarregá-la.");
    return created;
  },
  async update(id, expectedVersion, input, canWriteFinancial) {
    validateRegistrations(input);
    const { data, error } = await supabase.rpc("save_operation_transactional", {
      p_id: id,
      p_expected_version: expectedVersion,
      ...transactionalArguments(input, canWriteFinancial),
    });
    if (error) throw friendlyError(error, "Não foi possível atualizar a operação.");
    const operationId = data as string;
    if (!operationId) throw new OperationConcurrencyError();
    const updated = await this.getById(operationId, canWriteFinancial);
    if (!updated) throw new OperationConcurrencyError();
    return updated;
  },
  async softDelete(id, expectedVersion) {
    const { data, error } = await supabase.rpc("soft_delete_record", { p_entity_type: "operations", p_id: id, p_expected_version: expectedVersion });
    if (error) throw friendlyError(error, "Não foi possível excluir a operação.");
    if (data !== 1) throw new OperationConcurrencyError();
  },
};
