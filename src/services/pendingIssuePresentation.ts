import type {
  PendingIssue, PendingIssueAssignee, PendingIssueEventType, PendingIssueFilters, PendingIssueStatus,
  PendingIssueSummary, PendingIssueType,
} from "../types/pendingIssue";

export const pendingIssueTypeLabels: Record<PendingIssueType, string> = {
  document_expired: "Documento vencido",
  document_expiring: "Documento próximo do vencimento",
  guarantee_expired: "Garantia com vencimento transcorrido",
  guarantee_expiring: "Garantia próxima do vencimento",
  operation_active_after_end_date: "Operação ativa após data de término",
};

export const pendingIssueStatusLabels: Record<PendingIssueStatus, string> = {
  open: "Aberta", in_analysis: "Em análise", in_progress: "Em tratamento",
  resolved: "Resolvida", justified: "Justificada",
};

export const pendingIssueEventLabels: Record<PendingIssueEventType, string> = {
  detected: "Pendência identificada", assigned: "Responsável alterado",
  status_changed: "Status alterado", deadline_changed: "Prazo alterado",
  note: "Observação", justified: "Pendência justificada",
  resolved: "Pendência resolvida", reopened: "Pendência reaberta",
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integer = new Intl.NumberFormat("pt-BR");
const civilDateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const timestampFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const formatCount = (value: number) => integer.format(value);
export const formatCivilDate = (value: string | null) => value
  ? civilDateFormatter.format(new Date(`${value.slice(0, 10)}T00:00:00Z`)) : "—";
export const formatTimestamp = (value: string | null) => value ? timestampFormatter.format(new Date(value)) : "—";
export const pendingIssueCapabilities = (permissions: string[]) => ({
  canRead: permissions.includes("pending_issues.read"),
  canManage: permissions.includes("pending_issues.manage"),
});
export const authenticatedLandingPath = (permissions: string[]) =>
  permissions.includes("pending_issues.read") && !permissions.includes("farms.read")
    ? "/pendencias" : "/dashboard";
export const conditionLabel = (issue: PendingIssue) => issue.currentlyDetected
  ? "Detectada atualmente" : "Não detectada atualmente";
export const showReopenReview = (issue: PendingIssue) => issue.needsReopenReview;
export const requiresJustification = (status: PendingIssueStatus, justification: string | null) =>
  status === "justified" && !justification?.trim();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validatePendingIssueFilters = (filters: PendingIssueFilters) => {
  if (filters.search.length > 100) return "A busca pode ter no máximo 100 caracteres.";
  if ([filters.operationId, filters.institutionId, filters.farmId].some((id) => id && !uuidPattern.test(id.trim())))
    return "Informe IDs válidos nos filtros avançados.";
  if (filters.assignedTo && !uuidPattern.test(filters.assignedTo)) return "Informe um ID válido para o responsável.";
  return "";
};
export const financialAllowed = (summary: PendingIssueSummary) => summary.operationsWithoutFinancialValue !== null;
export const formatSummaryAmount = (summary: PendingIssueSummary) => !financialAllowed(summary)
  ? "Restrito" : summary.totalFinancialAmount === null ? "Não informado" : currency.format(summary.totalFinancialAmount);
export const formatIssueAmount = (issue: PendingIssue, allowed: boolean) => !allowed
  ? "Restrito" : issue.operationAmount !== null ? currency.format(issue.operationAmount)
    : issue.guaranteeAmount !== null ? currency.format(issue.guaranteeAmount) : "—";

export const formatSourceTime = (issue: PendingIssue) => issue.daysOverdue !== null
  ? `${formatCount(issue.daysOverdue)} ${issue.daysOverdue === 1 ? "dia" : "dias"} em atraso`
  : issue.daysUntilDue !== null
    ? `Vence em ${formatCount(issue.daysUntilDue)} ${issue.daysUntilDue === 1 ? "dia" : "dias"}`
    : "Sem prazo objetivo";

export const formatInternalTime = (issue: PendingIssue) => issue.internalDaysOverdue !== null
  ? `${formatCount(issue.internalDaysOverdue)} ${issue.internalDaysOverdue === 1 ? "dia" : "dias"} após o prazo`
  : issue.internalDaysUntilDue !== null
    ? `Vence em ${formatCount(issue.internalDaysUntilDue)} ${issue.internalDaysUntilDue === 1 ? "dia" : "dias"}`
    : "Sem prazo interno";

export const summarizeNames = (names: string[]) => names.length === 0 ? "—"
  : names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
export const pendingEmptyMessage = (filtered: boolean) => filtered
  ? "Nenhuma pendência corresponde aos filtros selecionados."
  : "Nenhuma pendência identificada no momento.";

export const assigneeOptions = (candidates: PendingIssueAssignee[], selectedId: string | null, formerName: string | null) => [
  ...(selectedId && !candidates.some((person) => person.id === selectedId)
    ? [{ id: selectedId, label: `${formerName ?? "Responsável anterior"} (inativo)` }] : []),
  ...candidates.map((person) => ({ id: person.id, label: `${person.name} · ${person.roleName}` })),
];
