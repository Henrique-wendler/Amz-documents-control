import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type {
  PendingIssue, PendingIssueAssignee, PendingIssueEvent, PendingIssueEventsPage,
  PendingIssueFilters, PendingIssueManagement, PendingIssuePage, PendingIssueRegistration,
  PendingIssueFarm, PendingIssueOwner, PendingIssueSummary,
} from "../types/pendingIssue";
import { pendingIssueErrorFromCode, type PendingIssueRepository } from "./pendingIssueRepository";

interface ListRow {
  pending_issue_id: string; issue_type: PendingIssue["type"]; status: PendingIssue["status"];
  currently_detected: boolean; needs_reopen_review: boolean; identified_at: string;
  source_date: string | null; days_overdue: number | null; days_until_due: number | null;
  resolution_due_date: string | null; internal_days_overdue: number | null;
  internal_days_until_due: number | null; assigned_to: string | null;
  responsible_name: string | null; updated_at: string; source_kind: PendingIssue["sourceKind"];
  source_name: string | null; operation_id: string | null; operation_number: string | null;
  institution_id: string | null; institution_name: string | null; guarantee_id: string | null;
  document_id: string | null; registrations: unknown; farms: unknown; owners: unknown;
  operation_amount: number | string | null; guarantee_amount: number | string | null;
  total_count: number | string;
}

interface SummaryRow {
  open_count: number | string; currently_detected_count: number | string;
  needs_reopen_review_count: number | string; affected_operations_count: number | string;
  total_financial_amount: number | string | null;
  operations_without_financial_value: number | string | null;
  internal_overdue_count: number | string; unassigned_count: number | string;
  max_days_overdue: number | null;
}

interface ManagementRow {
  id: string; version: number; status: PendingIssueManagement["status"];
  assigned_to: string | null; resolution_due_date: string | null;
  justification: string | null; resolved_at: string | null; updated_at: string;
}

interface EventRow {
  id: string; event_order: number | string; event_type: PendingIssueEvent["type"];
  actor_id: string | null; note: string | null; metadata: Record<string, unknown>;
  created_at: string;
}

const number = (value: number | string) => Number(value);
const nullableNumber = (value: number | string | null) => value === null ? null : Number(value);
const jsonArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

const mapIssue = (row: ListRow): PendingIssue => ({
  id: row.pending_issue_id, type: row.issue_type, status: row.status,
  currentlyDetected: row.currently_detected, needsReopenReview: row.needs_reopen_review,
  identifiedAt: row.identified_at, sourceDate: row.source_date,
  daysOverdue: row.days_overdue, daysUntilDue: row.days_until_due,
  resolutionDueDate: row.resolution_due_date,
  internalDaysOverdue: row.internal_days_overdue,
  internalDaysUntilDue: row.internal_days_until_due,
  assignedTo: row.assigned_to, responsibleName: row.responsible_name,
  updatedAt: row.updated_at, sourceKind: row.source_kind, sourceName: row.source_name,
  operationId: row.operation_id, operationNumber: row.operation_number,
  institutionId: row.institution_id, institutionName: row.institution_name,
  guaranteeId: row.guarantee_id, documentId: row.document_id,
  registrations: jsonArray<PendingIssueRegistration>(row.registrations),
  farms: jsonArray<PendingIssueFarm>(row.farms), owners: jsonArray<PendingIssueOwner>(row.owners),
  operationAmount: nullableNumber(row.operation_amount), guaranteeAmount: nullableNumber(row.guarantee_amount),
});

const mapSummary = (row: SummaryRow): PendingIssueSummary => ({
  openCount: number(row.open_count), currentlyDetectedCount: number(row.currently_detected_count),
  needsReopenReviewCount: number(row.needs_reopen_review_count),
  affectedOperationsCount: number(row.affected_operations_count),
  totalFinancialAmount: nullableNumber(row.total_financial_amount),
  operationsWithoutFinancialValue: nullableNumber(row.operations_without_financial_value),
  internalOverdueCount: number(row.internal_overdue_count), unassignedCount: number(row.unassigned_count),
  maxDaysOverdue: row.max_days_overdue,
});

const mapManagement = (row: ManagementRow): PendingIssueManagement => ({
  id: row.id, version: row.version, status: row.status, assignedTo: row.assigned_to,
  resolutionDueDate: row.resolution_due_date, justification: row.justification,
  resolvedAt: row.resolved_at, updatedAt: row.updated_at,
});

const mapEvent = (row: EventRow): PendingIssueEvent => ({
  id: row.id, order: number(row.event_order), type: row.event_type,
  actorId: row.actor_id, note: row.note, metadata: row.metadata ?? {}, createdAt: row.created_at,
});

const friendlyError = (error: PostgrestError, fallback: string): Error => pendingIssueErrorFromCode(error.code, fallback);

const listSize = 50;
const managementSelection = "id, version, status, assigned_to, resolution_due_date, justification, resolved_at, updated_at";
const eventSelection = "id, event_order, event_type, actor_id, note, metadata, created_at";

export const supabasePendingIssueRepository: PendingIssueRepository = {
  async reconcile() {
    const { data, error } = await supabase.rpc("reconcile_pending_issues");
    if (error) throw friendlyError(error, "Não foi possível atualizar as pendências.");
    return Number(data ?? 0);
  },
  async list(filters: PendingIssueFilters): Promise<PendingIssuePage> {
    const { data, error } = await supabase.rpc("list_pending_issues", {
      p_status: filters.status || null,
      p_issue_type: filters.type || null,
      p_assigned_to: filters.assignedTo || null,
      p_currently_detected: filters.currentlyDetected === "all" ? null : filters.currentlyDetected === "yes",
      p_internal_overdue: filters.internalOverdue === "all" ? null : filters.internalOverdue === "yes",
      p_operation_id: filters.operationId || null,
      p_institution_id: filters.institutionId || null,
      p_farm_id: filters.farmId || null,
      p_search: filters.search.trim() || null,
      p_sort: filters.sort,
      p_limit: filters.pageSize,
      p_offset: (filters.page - 1) * filters.pageSize,
    });
    if (error) throw friendlyError(error, "Não foi possível consultar as pendências.");
    const rows = (data ?? []) as ListRow[];
    return { items: rows.map(mapIssue), total: rows.length ? number(rows[0].total_count) : 0,
      page: filters.page, pageSize: filters.pageSize };
  },
  async getSummary() {
    const { data, error } = await supabase.rpc("get_pending_issue_summary").single();
    if (error || !data) throw error ? friendlyError(error, "Não foi possível carregar o resumo.") : new Error("Não foi possível carregar o resumo.");
    return mapSummary(data as SummaryRow);
  },
  async listAssignees() {
    const { data, error } = await supabase.rpc("list_pending_issue_assignees");
    if (error) throw friendlyError(error, "Não foi possível carregar os responsáveis.");
    return ((data ?? []) as Array<{ profile_id: string; full_name: string; role_key: string; role_name: string }>).map(
      (row): PendingIssueAssignee => ({ id: row.profile_id, name: row.full_name, roleKey: row.role_key, roleName: row.role_name }),
    );
  },
  async getManagement(id) {
    const { data, error } = await supabase.from("pending_issue_management")
      .select(managementSelection).eq("id", id).maybeSingle();
    if (error) throw friendlyError(error, "Não foi possível abrir a pendência.");
    if (!data) throw new Error("Esta pendência não está mais disponível.");
    return mapManagement(data as ManagementRow);
  },
  async updateManagement(input) {
    const { data, error } = await supabase.rpc("update_pending_issue_management", {
      p_pending_issue_id: input.id, p_expected_version: input.expectedVersion,
      p_assigned_to: input.assignedTo, p_status: input.status,
      p_resolution_due_date: input.resolutionDueDate, p_justification: input.justification,
    });
    if (error) throw friendlyError(error, "Não foi possível salvar a pendência.");
    if (typeof data !== "number") throw new Error("Não foi possível confirmar a atualização da pendência.");
    return data;
  },
  async listEvents(id, offset): Promise<PendingIssueEventsPage> {
    const { data, error } = await supabase.from("pending_issue_events")
      .select(eventSelection).eq("pending_issue_id", id)
      .order("created_at", { ascending: false }).order("event_order", { ascending: false })
      .range(offset, offset + listSize);
    if (error) throw friendlyError(error, "Não foi possível carregar o histórico.");
    const rows = (data ?? []) as EventRow[];
    return { items: rows.slice(0, listSize).map(mapEvent), hasMore: rows.length > listSize };
  },
  async addNote(id, note) {
    const { error } = await supabase.rpc("add_pending_issue_note", { p_pending_issue_id: id, p_note: note });
    if (error) throw friendlyError(error, "Não foi possível adicionar a observação.");
  },
};
