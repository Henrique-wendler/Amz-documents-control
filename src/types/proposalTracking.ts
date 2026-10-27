export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export interface TrackingFilters {
  startDate: string;
  endDate: string;
  technician: string;
  responsible: string;
  bankId: string;
  status: ApprovalStatus | "";
  onlyOverdue: boolean;
  withoutDeadline: boolean;
  query: string;
}
export interface TrackingAccess {
  read: boolean;
  financial: boolean;
  manage: boolean;
}
export interface TrackingOption {
  id: string;
  name: string;
}
export interface TrackingOptions {
  banks: TrackingOption[];
  technicians: TrackingOption[];
  responsibles: TrackingOption[];
  profiles: TrackingOption[];
}
export interface TrackingDraft {
  approvalDeadline: string;
  approvalStatus: ApprovalStatus;
  responsibleProfileId: string;
  responsibleName: string;
  technicianProfileId: string;
  technicianName: string;
  delayReason: string;
  delayNotes: string;
}
export interface TrackingEntry extends TrackingDraft {
  operationId: string;
  operationNumber: string;
  purpose: string;
  bankName: string;
  overdueDays: number;
  amount?: string | null;
  updatedAt: string;
  lastFollowUpAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  version: number;
}
export interface TrackingGroup {
  key: string;
  name: string;
  overdueCount: number;
  averageDays: number;
  maximumDays: number;
  overdueAmountTotal?: string;
}
export interface TrackingReport {
  today: string;
  timezone: string;
  financialAccess: boolean;
  page: number;
  pageSize: number;
  totalRows: number;
  kpis: {
    overdueCount: number;
    averageDays: number;
    maximumDays: number;
    withoutDeadlineCount: number;
    overdueAmountTotal?: string;
  };
  technicians: TrackingGroup[];
  responsibles: TrackingGroup[];
  rows: TrackingEntry[];
}
