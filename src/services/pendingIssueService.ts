import { supabasePendingIssueRepository } from "../repositories/supabasePendingIssueRepository";
import { createPendingIssueService } from "./pendingIssueServiceCore";

export { initialPendingIssueFilters } from "./pendingIssueServiceCore";
export const pendingIssueService = createPendingIssueService(supabasePendingIssueRepository);
