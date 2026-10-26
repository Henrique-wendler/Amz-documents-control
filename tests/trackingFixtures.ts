import type {
  TrackingAccess,
  TrackingEntry,
  TrackingOptions,
  TrackingReport,
} from "../src/types/proposalTracking";
export const access: TrackingAccess = {
  read: true,
  financial: true,
  manage: true,
};
export const row: TrackingEntry = {
  operationId: "operation-1",
  operationNumber: "2026-0042",
  purpose: "Custeio QA",
  bankName: "Banco QA",
  approvalDeadline: "2026-10-20",
  approvalStatus: "pending",
  responsibleProfileId: "manager-1",
  responsibleName: "Gustavo",
  technicianProfileId: "technician-1",
  technicianName: "Andre",
  delayReason: "Aguardando banco",
  delayNotes: "Observação QA",
  overdueDays: 6,
  amount: "500000.00",
  updatedAt: "2026-10-26T10:00:00-03:00",
  lastFollowUpAt: null,
  approvedAt: null,
  rejectedAt: null,
  cancelledAt: null,
  version: 3,
};
export const options: TrackingOptions = {
  banks: [{ id: "bank-1", name: "Banco QA" }],
  technicians: [{ id: "technician-1", name: "Andre" }],
  responsibles: [{ id: "manager-1", name: "Gustavo" }],
  profiles: [
    { id: "technician-1", name: "Andre" },
    { id: "manager-1", name: "Gustavo" },
  ],
};
export const report: TrackingReport = {
  today: "2026-10-26",
  timezone: "America/Araguaina",
  financialAccess: true,
  page: 1,
  pageSize: 25,
  totalRows: 1,
  kpis: {
    overdueCount: 1,
    overdueAmountTotal: "500000.00",
    averageDays: 6,
    maximumDays: 6,
    withoutDeadlineCount: 0,
  },
  technicians: [
    {
      key: "technician-1",
      name: "Andre",
      overdueCount: 1,
      overdueAmountTotal: "500000.00",
      averageDays: 6,
      maximumDays: 6,
    },
  ],
  responsibles: [
    {
      key: "manager-1",
      name: "Gustavo",
      overdueCount: 1,
      overdueAmountTotal: "500000.00",
      averageDays: 6,
      maximumDays: 6,
    },
  ],
  rows: [row],
};
