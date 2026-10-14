import assert from "node:assert/strict";
import test from "node:test";
import { PendingIssueConcurrencyError, pendingIssueErrorFromCode } from "../src/repositories/pendingIssueRepository.ts";
import {
  assigneeOptions, authenticatedLandingPath, conditionLabel, financialAllowed, formatIssueAmount, formatSourceTime,
  formatSummaryAmount, pendingEmptyMessage, pendingIssueCapabilities, pendingIssueStatusLabels,
  pendingIssueTypeLabels, requiresJustification, showReopenReview, summarizeNames,
  validatePendingIssueFilters,
} from "../src/services/pendingIssuePresentation.ts";
import { createPendingIssueService, initialPendingIssueFilters } from "../src/services/pendingIssueServiceCore.ts";

const summary = { openCount: 2, currentlyDetectedCount: 1, needsReopenReviewCount: 1,
  affectedOperationsCount: 1, totalFinancialAmount: null, operationsWithoutFinancialValue: null,
  internalOverdueCount: 0, unassignedCount: 1, maxDaysOverdue: null };
const issue = { currentlyDetected: false, needsReopenReview: true, daysOverdue: null,
  daysUntilDue: 12, operationAmount: null, guaranteeAmount: null };

test("permission guard uses Central permissions only", () => {
  assert.deepEqual(pendingIssueCapabilities(["financial.read", "operations.read"]), { canRead: false, canManage: false });
  assert.deepEqual(pendingIssueCapabilities(["pending_issues.read"]), { canRead: true, canManage: false });
  assert.deepEqual(pendingIssueCapabilities(["pending_issues.read", "pending_issues.manage"]), { canRead: true, canManage: true });
  assert.equal(authenticatedLandingPath(["pending_issues.read"]), "/pendencias");
  assert.equal(authenticatedLandingPath(["pending_issues.read", "farms.read"]), "/dashboard");
});

test("all five issue types and statuses use approved labels", () => {
  assert.equal(Object.keys(pendingIssueTypeLabels).length, 5);
  assert.equal(pendingIssueTypeLabels.operation_active_after_end_date, "Operação ativa após data de término");
  assert.equal(Object.keys(pendingIssueStatusLabels).length, 5);
  assert.equal(pendingIssueStatusLabels.in_progress, "Em tratamento");
});

test("financial NULL never becomes zero, while known zero remains zero", () => {
  assert.equal(financialAllowed(summary), false);
  assert.equal(formatSummaryAmount(summary), "Restrito");
  assert.equal(formatIssueAmount(issue, false), "Restrito");
  assert.equal(formatSummaryAmount({ ...summary, operationsWithoutFinancialValue: 1 }), "Não informado");
  assert.equal(formatSummaryAmount({ ...summary, operationsWithoutFinancialValue: 0, totalFinancialAmount: 0 }), "R$ 0,00");
});

test("current detection and reopen review reflect backend flags independently", () => {
  assert.equal(conditionLabel(issue), "Não detectada atualmente");
  assert.equal(showReopenReview(issue), true);
  assert.equal(conditionLabel({ ...issue, currentlyDetected: true }), "Detectada atualmente");
  assert.equal(showReopenReview({ ...issue, currentlyDetected: true, needsReopenReview: false }), false);
});

test("source time distinguishes future due dates from overdue days", () => {
  assert.equal(formatSourceTime(issue), "Vence em 12 dias");
  assert.equal(formatSourceTime({ ...issue, daysOverdue: 45, daysUntilDue: null }), "45 dias em atraso");
});

test("assignee selector only offers RPC candidates and preserves a historical selection", () => {
  const candidates = [{ id: "candidate", name: "Técnico", roleKey: "technician", roleName: "Técnico" }];
  assert.deepEqual(assigneeOptions(candidates, null, null), [{ id: "candidate", label: "Técnico · Técnico" }]);
  assert.deepEqual(assigneeOptions(candidates, "former", "Antigo")[0], { id: "former", label: "Antigo (inativo)" });
});

test("justified needs text and other statuses clear justification", () => {
  assert.equal(requiresJustification("justified", "  "), true);
  assert.equal(requiresJustification("justified", "Motivo"), false);
  assert.equal(requiresJustification("resolved", null), false);
});

test("multiplicity and empty states remain legible", () => {
  assert.equal(summarizeNames(["Santa Luzia", "Alto Verde", "Boa Vista"]), "Santa Luzia +2");
  assert.equal(summarizeNames([]), "—");
  assert.equal(pendingEmptyMessage(false), "Nenhuma pendência identificada no momento.");
  assert.equal(pendingEmptyMessage(true), "Nenhuma pendência corresponde aos filtros selecionados.");
});

test("filter validation accepts supported UUIDs and rejects partial IDs", () => {
  assert.equal(validatePendingIssueFilters(initialPendingIssueFilters), "");
  assert.match(validatePendingIssueFilters({ ...initialPendingIssueFilters, farmId: "partial" }), /IDs válidos/);
  assert.equal(validatePendingIssueFilters({ ...initialPendingIssueFilters, farmId: "12345678-1234-4234-8234-123456789012" }), "");
});

test("40001 maps to a concurrency error without SQL details", () => {
  const error = pendingIssueErrorFromCode("40001", "fallback");
  assert.ok(error instanceof PendingIssueConcurrencyError);
  assert.match(error.message, /alterada por outro usuário/);
  assert.equal(pendingIssueErrorFromCode("XX000", "Falha segura").message, "Falha segura");
});

test("service reconciles only when requested and forwards expected version", async () => {
  const calls = [];
  const management = { id: "issue", version: 3 };
  const repository = {
    reconcile: async () => { calls.push("reconcile"); return 1; },
    getSummary: async () => { calls.push("summary"); return summary; },
    list: async () => { calls.push("list"); return { items: [], total: 0, page: 1, pageSize: 20 }; },
    getManagement: async () => management,
    updateManagement: async (input) => { calls.push(input.expectedVersion); return 3; },
  };
  const service = createPendingIssueService(repository);
  await service.refresh(initialPendingIssueFilters, true);
  assert.equal(calls[0], "reconcile");
  calls.length = 0;
  await service.refresh(initialPendingIssueFilters, false);
  assert.equal(calls.includes("reconcile"), false);
  assert.equal((await service.update({ id: "issue", expectedVersion: 2, assignedTo: null,
    status: "resolved", resolutionDueDate: null, justification: null })).version, 3);
  assert.equal(calls.at(-1), 2);
});

test("service propagates a version conflict without replacing the old write", async () => {
  const service = createPendingIssueService({
    updateManagement: async () => { throw new PendingIssueConcurrencyError(); },
  });
  await assert.rejects(() => service.update({ id: "issue", expectedVersion: 1,
    assignedTo: null, status: "open", resolutionDueDate: null, justification: null }),
  PendingIssueConcurrencyError);
});
