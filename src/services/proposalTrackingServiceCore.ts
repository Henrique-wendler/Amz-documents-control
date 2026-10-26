import type { ProposalTrackingRepository } from "../repositories/proposalTrackingRepository";
import type {
  TrackingAccess,
  TrackingDraft,
  TrackingFilters,
} from "../types/proposalTracking";
export const initialTrackingFilters: TrackingFilters = {
  startDate: "",
  endDate: "",
  technician: "",
  responsible: "",
  bankId: "",
  status: "pending",
  onlyOverdue: false,
  withoutDeadline: false,
  query: "",
};
export const emptyTrackingDraft = (): TrackingDraft => ({
  approvalDeadline: "",
  approvalStatus: "pending",
  responsibleProfileId: "",
  responsibleName: "",
  technicianProfileId: "",
  technicianName: "",
  delayReason: "",
  delayNotes: "",
});
const requireAccess = (allowed: boolean) => {
  if (!allowed) throw new Error("Você não possui permissão para esta ação.");
};
const validDate = (date: string) =>
  !date ||
  (/^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date);
export function createProposalTrackingService(
  repository: ProposalTrackingRepository,
) {
  return {
    async report(
      filters: TrackingFilters,
      page: number,
      access: TrackingAccess,
    ) {
      requireAccess(access.read);
      if (
        !validDate(filters.startDate) ||
        !validDate(filters.endDate) ||
        (filters.startDate &&
          filters.endDate &&
          filters.startDate > filters.endDate)
      )
        throw new Error(
          "Revise o período da data limite: a data inicial deve ser anterior à final.",
        );
      if (!Number.isInteger(page) || page < 1)
        throw new Error("Página inválida.");
      const report = await repository.report(
        { ...filters, query: filters.query.trim() },
        page,
      );
      if (access.financial && report.financialAccess) return report;
      const { overdueAmountTotal: _total, ...kpis } = report.kpis;
      return {
        ...report,
        financialAccess: false,
        kpis,
        rows: report.rows.map(({ amount: _amount, ...row }) => row),
        technicians: report.technicians.map(
          ({ overdueAmountTotal: _amount, ...item }) => item,
        ),
        responsibles: report.responsibles.map(
          ({ overdueAmountTotal: _amount, ...item }) => item,
        ),
      };
    },
    async options(access: TrackingAccess) {
      requireAccess(access.read);
      return repository.options();
    },
    async searchOperations(query: string, access: TrackingAccess) {
      requireAccess(access.manage);
      return repository.searchOperations(query.trim().slice(0, 100));
    },
    async save(
      operationId: string,
      version: number | null,
      draft: TrackingDraft,
      access: TrackingAccess,
    ) {
      requireAccess(access.manage);
      if (!operationId) throw new Error("Selecione uma operação existente.");
      if (!validDate(draft.approvalDeadline))
        throw new Error("Informe uma data limite válida.");
      if (
        !["pending", "approved", "rejected", "cancelled"].includes(
          draft.approvalStatus,
        )
      )
        throw new Error("Situação inválida.");
      if (
        draft.delayReason.length > 500 ||
        draft.delayNotes.length > 4000 ||
        draft.responsibleName.length > 200 ||
        draft.technicianName.length > 200
      )
        throw new Error("Revise o tamanho dos textos informados.");
      await repository.save(operationId, version, {
        ...draft,
        responsibleName: draft.responsibleName.trim(),
        technicianName: draft.technicianName.trim(),
        delayReason: draft.delayReason.trim(),
        delayNotes: draft.delayNotes.trim(),
      });
    },
  };
}
