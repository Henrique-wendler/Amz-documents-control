export type PendingIssueType =
  | "document_expired" | "document_expiring"
  | "guarantee_expired" | "guarantee_expiring"
  | "operation_active_after_end_date";

export type PendingIssueStatus = "open" | "in_analysis" | "in_progress" | "resolved" | "justified";
export type PendingIssueEventType = "detected" | "assigned" | "status_changed" | "deadline_changed" | "note" | "justified" | "resolved" | "reopened";
export type PendingIssueSort = "identified_desc" | "identified_asc" | "source_date_asc" | "source_date_desc";

export interface PendingIssueRegistration { relation: "operation" | "guarantee" | "document"; id: string; number: string; farmId: string; }
export interface PendingIssueFarm { id: string; name: string; municipality: string | null; state: string | null; }
export interface PendingIssueOwner { id: string; name: string; status: string; }

export interface PendingIssue {
  id: string;
  type: PendingIssueType;
  status: PendingIssueStatus;
  currentlyDetected: boolean;
  needsReopenReview: boolean;
  identifiedAt: string;
  sourceDate: string | null;
  daysOverdue: number | null;
  daysUntilDue: number | null;
  resolutionDueDate: string | null;
  internalDaysOverdue: number | null;
  internalDaysUntilDue: number | null;
  assignedTo: string | null;
  responsibleName: string | null;
  updatedAt: string;
  sourceKind: "document" | "guarantee" | "operation";
  sourceName: string | null;
  operationId: string | null;
  operationNumber: string | null;
  institutionId: string | null;
  institutionName: string | null;
  guaranteeId: string | null;
  documentId: string | null;
  registrations: PendingIssueRegistration[];
  farms: PendingIssueFarm[];
  owners: PendingIssueOwner[];
  operationAmount: number | null;
  guaranteeAmount: number | null;
}

export interface PendingIssueSummary {
  openCount: number;
  currentlyDetectedCount: number;
  needsReopenReviewCount: number;
  affectedOperationsCount: number;
  totalFinancialAmount: number | null;
  operationsWithoutFinancialValue: number | null;
  internalOverdueCount: number;
  unassignedCount: number;
  maxDaysOverdue: number | null;
}

export interface PendingIssueFilters {
  status: PendingIssueStatus | "";
  type: PendingIssueType | "";
  assignedTo: string;
  currentlyDetected: "all" | "yes" | "no";
  internalOverdue: "all" | "yes" | "no";
  operationId: string;
  institutionId: string;
  farmId: string;
  search: string;
  sort: PendingIssueSort;
  page: number;
  pageSize: number;
}

export interface PendingIssuePage { items: PendingIssue[]; total: number; page: number; pageSize: number; }
export interface PendingIssueAssignee { id: string; name: string; roleKey: string; roleName: string; }
export interface PendingIssueManagement {
  id: string;
  version: number;
  status: PendingIssueStatus;
  assignedTo: string | null;
  resolutionDueDate: string | null;
  justification: string | null;
  resolvedAt: string | null;
  updatedAt: string;
}
export interface PendingIssueUpdate {
  id: string;
  expectedVersion: number;
  assignedTo: string | null;
  status: PendingIssueStatus;
  resolutionDueDate: string | null;
  justification: string | null;
}
export interface PendingIssueEvent {
  id: string;
  order: number;
  type: PendingIssueEventType;
  actorId: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
export interface PendingIssueEventsPage { items: PendingIssueEvent[]; hasMore: boolean; }
