import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProposalTrackingService,
  emptyTrackingDraft,
  initialTrackingFilters,
} from "../src/services/proposalTrackingServiceCore";
import { access, options, report, row } from "./trackingFixtures";
import type { ProposalTrackingRepository } from "../src/repositories/proposalTrackingRepository";
describe("proposal tracking service", () => {
  let repository: ProposalTrackingRepository;
  beforeEach(() => {
    repository = {
      report: vi.fn().mockResolvedValue(structuredClone(report)),
      options: vi.fn().mockResolvedValue(options),
      searchOperations: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
    };
  });
  it("passes filters and page to repository without loading all operations", async () => {
    const filters = {
      ...initialTrackingFilters,
      query: "  2026-0042  ",
      onlyOverdue: true,
      technician: "technician-1",
      responsible: "manager-1",
      bankId: "bank-1",
    };
    await createProposalTrackingService(repository).report(filters, 2, access);
    expect(repository.report).toHaveBeenCalledExactlyOnceWith(
      { ...filters, query: "2026-0042" },
      2,
    );
  });
  it("denies unauthorized read before contacting repository", async () => {
    await expect(
      createProposalTrackingService(repository).report(
        initialTrackingFilters,
        1,
        { ...access, read: false },
      ),
    ).rejects.toThrow("permissão");
    expect(repository.report).not.toHaveBeenCalled();
  });
  it("financial permission alone cannot authorize report", async () => {
    await expect(
      createProposalTrackingService(repository).options({
        ...access,
        read: false,
      }),
    ).rejects.toThrow("permissão");
    expect(repository.options).not.toHaveBeenCalled();
  });
  it("removes all monetary values if client permission was revoked", async () => {
    const data = await createProposalTrackingService(repository).report(
      initialTrackingFilters,
      1,
      { ...access, financial: false },
    );
    expect(data.financialAccess).toBe(false);
    expect(data.kpis).not.toHaveProperty("overdueAmountTotal");
    expect(data.rows[0]).not.toHaveProperty("amount");
    expect(data.technicians[0]).not.toHaveProperty("overdueAmountTotal");
    expect(data.responsibles[0]).not.toHaveProperty("overdueAmountTotal");
    expect(report.rows[0].amount).toBe("500000.00");
  });
  it("respects financial denial by server even if client permission is stale", async () => {
    vi.mocked(repository.report).mockResolvedValue({
      ...report,
      financialAccess: false,
    });
    const data = await createProposalTrackingService(repository).report(
      initialTrackingFilters,
      1,
      access,
    );
    expect(data.rows[0]).not.toHaveProperty("amount");
  });
  it.each([
    { startDate: "2026-10-27", endDate: "2026-10-26" },
    { startDate: "2026-02-30", endDate: "" },
  ])("rejects invalid period %j", async (dates) => {
    await expect(
      createProposalTrackingService(repository).report(
        { ...initialTrackingFilters, ...dates },
        1,
        access,
      ),
    ).rejects.toThrow("período");
    expect(repository.report).not.toHaveBeenCalled();
  });
  it("read-only users cannot save or search editing catalog", async () => {
    const service = createProposalTrackingService(repository),
      readonly = { ...access, manage: false };
    await expect(
      service.save(row.operationId, 3, row, readonly),
    ).rejects.toThrow("permissão");
    await expect(service.searchOperations("", readonly)).rejects.toThrow(
      "permissão",
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.searchOperations).not.toHaveBeenCalled();
  });
  it("saves separate people, status and expected version", async () => {
    await createProposalTrackingService(repository).save(
      row.operationId,
      3,
      { ...row, approvalStatus: "approved", responsibleName: " Maria " },
      access,
    );
    expect(repository.save).toHaveBeenCalledWith(
      row.operationId,
      3,
      expect.objectContaining({
        responsibleName: "Maria",
        technicianName: "Andre",
        approvalStatus: "approved",
      }),
    );
  });
  it("allows adoption with no invented deadline and null initial version", async () => {
    await createProposalTrackingService(repository).save(
      row.operationId,
      null,
      emptyTrackingDraft(),
      access,
    );
    expect(repository.save).toHaveBeenCalledWith(
      row.operationId,
      null,
      expect.objectContaining({
        approvalDeadline: "",
        approvalStatus: "pending",
      }),
    );
  });
  it.each(["", "operation-1"])(
    "validates required operation and civil date %s",
    async (id) => {
      await expect(
        createProposalTrackingService(repository).save(
          id,
          null,
          { ...emptyTrackingDraft(), approvalDeadline: "2026-02-30" },
          access,
        ),
      ).rejects.toThrow();
      expect(repository.save).not.toHaveBeenCalled();
    },
  );
  it("requires valid page before server query", async () => {
    await expect(
      createProposalTrackingService(repository).report(
        initialTrackingFilters,
        0,
        access,
      ),
    ).rejects.toThrow("Página");
  });
});
