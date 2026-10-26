import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { ProposalTrackingRepository } from "./proposalTrackingRepository";
import type {
  ApprovalStatus,
  TrackingGroup,
  TrackingEntry,
  TrackingOption,
  TrackingOptions,
} from "../types/proposalTracking";

type Row = Record<string, unknown>;
const errorMessage = (error: PostgrestError) => {
  if (error.code === "42501")
    return new Error(
      "Você não possui permissão para acessar ou alterar este acompanhamento.",
    );
  if (error.code === "40001")
    return new Error(
      "O acompanhamento foi alterado por outro usuário. Atualize os dados antes de salvar.",
    );
  if (["23503", "23502"].includes(error.code))
    return new Error(
      "A operação ou o perfil informado não pertence à organização atual ou está indisponível.",
    );
  if (["22023", "22007", "22008", "23514", "22P02"].includes(error.code))
    return new Error(
      "Revise os filtros, as datas e os campos do acompanhamento.",
    );
  return new Error(
    "Não foi possível acessar o acompanhamento de propostas. Tente novamente.",
  );
};
const money = (value: unknown) => (value == null ? undefined : String(value));
const group = (row: Row): TrackingGroup => ({
  key: String(row.group_key),
  name: String(row.name || "Sem vínculo definido"),
  overdueCount: Number(row.overdue_count),
  averageDays: Number(row.average_days),
  maximumDays: Number(row.maximum_days),
  ...(row.overdue_amount_total === undefined
    ? {}
    : { overdueAmountTotal: money(row.overdue_amount_total) }),
});
const entry = (row: Row): TrackingEntry => ({
  operationId: String(row.operation_id),
  operationNumber: String(row.operation_number),
  purpose: String(row.purpose ?? ""),
  bankName: String(row.bank_name),
  approvalDeadline: String(row.approval_deadline ?? ""),
  approvalStatus: row.approval_status as ApprovalStatus,
  responsibleProfileId: String(row.responsible_profile_id ?? ""),
  responsibleName: String(row.responsible_name_snapshot ?? ""),
  technicianProfileId: String(row.technician_profile_id ?? ""),
  technicianName: String(row.technician_name_snapshot ?? ""),
  delayReason: String(row.delay_reason ?? ""),
  delayNotes: String(row.delay_notes ?? ""),
  overdueDays: Number(row.overdue_days),
  updatedAt: String(row.updated_at),
  lastFollowUpAt: row.last_follow_up_at as string | null,
  approvedAt: row.approved_at as string | null,
  rejectedAt: row.rejected_at as string | null,
  cancelledAt: row.cancelled_at as string | null,
  version: Number(row.version),
  ...(row.amount === undefined
    ? {}
    : { amount: row.amount === null ? null : String(row.amount) }),
});
export const supabaseProposalTrackingRepository: ProposalTrackingRepository = {
  async report(filters, page) {
    const { data, error } = await supabase.rpc("proposal_tracking_report", {
      p_filters: {
        start_date: filters.startDate,
        end_date: filters.endDate,
        technician: filters.technician,
        responsible: filters.responsible,
        bank_id: filters.bankId,
        status: filters.status,
        only_overdue: filters.onlyOverdue,
        without_deadline: filters.withoutDeadline,
        query: filters.query,
      },
      p_page: page,
      p_page_size: 25,
    });
    if (error) throw errorMessage(error);
    if (!data || typeof data !== "object")
      throw new Error("Resposta de acompanhamento inválida.");
    const raw = data as Row,
      kpis = raw.kpis as Row;
    return {
      today: String(raw.today),
      timezone: String(raw.timezone),
      financialAccess: raw.financial_access === true,
      page: Number(raw.page),
      pageSize: Number(raw.page_size),
      totalRows: Number(raw.total_rows),
      kpis: {
        overdueCount: Number(kpis.overdue_count),
        averageDays: Number(kpis.average_days),
        maximumDays: Number(kpis.maximum_days),
        withoutDeadlineCount: Number(kpis.without_deadline_count),
        ...(kpis.overdue_amount_total === undefined
          ? {}
          : { overdueAmountTotal: money(kpis.overdue_amount_total) }),
      },
      technicians: (raw.technicians as Row[]).map(group),
      responsibles: (raw.responsibles as Row[]).map(group),
      rows: (raw.rows as Row[]).map(entry),
    };
  },
  async options() {
    const { data, error } = await supabase.rpc("proposal_tracking_options");
    if (error) throw errorMessage(error);
    return data as unknown as TrackingOptions;
  },
  async searchOperations(query) {
    const { data, error } = await supabase.rpc(
      "proposal_tracking_operation_search",
      { p_query: query },
    );
    if (error) throw errorMessage(error);
    return data as unknown as TrackingOption[];
  },
  async save(operationId, version, draft) {
    const { error } = await supabase.rpc("save_proposal_tracking", {
      p_operation_id: operationId,
      p_expected_version: version,
      p_values: {
        approval_deadline: draft.approvalDeadline || null,
        approval_status: draft.approvalStatus,
        responsible_profile_id: draft.responsibleProfileId || null,
        responsible_name_snapshot: draft.responsibleName,
        technician_profile_id: draft.technicianProfileId || null,
        technician_name_snapshot: draft.technicianName,
        delay_reason: draft.delayReason,
        delay_notes: draft.delayNotes,
      },
    });
    if (error) throw errorMessage(error);
  },
};
