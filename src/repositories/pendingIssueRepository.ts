import type {
  PendingIssueAssignee, PendingIssueEventsPage, PendingIssueFilters, PendingIssueManagement,
  PendingIssuePage, PendingIssueSummary, PendingIssueUpdate,
} from "../types/pendingIssue";

export class PendingIssueConcurrencyError extends Error {
  constructor() { super("Esta pendência foi alterada por outro usuário. Os dados foram atualizados."); }
}

export const pendingIssueErrorFromCode = (code: string, fallback: string): Error => {
  switch (code) {
    case "40001": return new PendingIssueConcurrencyError();
    case "42501": return new Error("Você não possui permissão para esta ação.");
    case "P0002": return new Error("Esta pendência não está mais disponível.");
    case "23514": case "23503": return new Error("Verifique o responsável, o status e a justificativa informados.");
    case "22023": return new Error("Verifique os filtros ou os dados informados.");
    default: return new Error(fallback);
  }
};

export interface PendingIssueRepository {
  reconcile(): Promise<number>;
  list(filters: PendingIssueFilters): Promise<PendingIssuePage>;
  getSummary(): Promise<PendingIssueSummary>;
  listAssignees(): Promise<PendingIssueAssignee[]>;
  getManagement(id: string): Promise<PendingIssueManagement>;
  updateManagement(input: PendingIssueUpdate): Promise<number>;
  listEvents(id: string, offset: number): Promise<PendingIssueEventsPage>;
  addNote(id: string, note: string): Promise<void>;
}
