import type { PendingIssueRepository } from "../repositories/pendingIssueRepository";
import type { PendingIssueFilters, PendingIssueUpdate } from "../types/pendingIssue";

export const initialPendingIssueFilters: PendingIssueFilters = {
  status: "", type: "", assignedTo: "", currentlyDetected: "all", internalOverdue: "all",
  operationId: "", institutionId: "", farmId: "", search: "", sort: "identified_desc",
  page: 1, pageSize: 20,
};

export const createPendingIssueService = (repository: PendingIssueRepository) => ({
  async refresh(filters: PendingIssueFilters, reconcile: boolean) {
    if (reconcile) await repository.reconcile();
    const [summary, page] = await Promise.all([repository.getSummary(), repository.list(filters)]);
    return { summary, page };
  },
  list: (filters: PendingIssueFilters) => repository.list(filters),
  listAssignees: () => repository.listAssignees(),
  async getDetail(id: string) {
    const [management, events] = await Promise.all([
      repository.getManagement(id), repository.listEvents(id, 0),
    ]);
    return { management, events };
  },
  async update(input: PendingIssueUpdate) {
    const updatedVersion = await repository.updateManagement(input);
    const management = await repository.getManagement(input.id);
    if (management.version < updatedVersion) throw new Error("Não foi possível confirmar a versão atual da pendência.");
    return management;
  },
  listEvents: (id: string, offset: number) => repository.listEvents(id, offset),
  addNote: (id: string, note: string) => repository.addNote(id, note),
});
