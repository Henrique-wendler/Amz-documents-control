import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { options, report, row } from "./trackingFixtures";
import { ProposalTrackingPage } from "../src/pages/ProposalTrackingPage";
import type { TrackingReport } from "../src/types/proposalTracking";
const state = vi.hoisted(() => ({
  permissions: [
    "proposal_reports.read",
    "proposal_reports.financial",
    "proposal_tracking.manage",
  ],
  service: {
    report: vi.fn(),
    options: vi.fn(),
    save: vi.fn(),
    searchOperations: vi.fn(),
  },
}));
vi.mock("../src/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (key: string) => state.permissions.includes(key),
  }),
}));
vi.mock("../src/services/proposalFileService", () => ({proposalFileService: {list: vi.fn(async () => []), open: vi.fn(), download: vi.fn()}}));
vi.mock("../src/services/proposalTrackingService", () => ({
  proposalTrackingService: state.service,
}));
vi.mock("../src/components/Header", () => ({
  Header: ({ title, onRefresh }: { title: string; onRefresh: () => void }) => (
    <header>
      <h1>{title}</h1>
      <button onClick={onRefresh}>Atualizar dados</button>
    </header>
  ),
}));
vi.mock("../src/components/Sidebar", () => ({
  Sidebar: () => <nav aria-label="Menu" />,
}));
const renderPage = () =>
  render(
    <FluentProvider theme={webLightTheme}>
      <ProposalTrackingPage onNavigate={vi.fn()} />
    </FluentProvider>,
  );
const loaded = () =>
  screen.findByRole("table", { name: "Propostas acompanhadas" });
beforeEach(() => {
  vi.clearAllMocks();
  state.permissions = [
    "proposal_reports.read",
    "proposal_reports.financial",
    "proposal_tracking.manage",
  ];
  state.service.report.mockResolvedValue(structuredClone(report));
  state.service.options.mockResolvedValue(options);
  state.service.searchOperations.mockResolvedValue([
    { id: "operation-new", name: "QA-NEW" },
  ]);
  state.service.save.mockResolvedValue(undefined);
});
describe("proposal tracking page", () => {
  it("denies route access without loading report", () => {
    state.permissions = [];
    renderPage();
    expect(screen.getByRole("alert").textContent).toContain(
      "não possui permissão",
    );
    expect(state.service.report).not.toHaveBeenCalled();
  });
  it("shows loading state", () => {
    state.service.report.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(
      screen.getByText("Carregando acompanhamento de propostas…"),
    ).toBeTruthy();
  });
  it("shows KPIs, independent groups, details and operational date", async () => {
    renderPage();
    const table = await loaded();
    expect(within(table).getByText("2026-0042")).toBeTruthy();
    expect(within(table).getByText("Gustavo")).toBeTruthy();
    expect(within(table).getByText("Andre")).toBeTruthy();
    for (const label of [
      "Propostas atrasadas",
      "Valor não ganho",
      "Atraso médio",
      "Maior atraso",
      "Sem prazo definido",
    ])
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByRole("table", { name: "Por técnico" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Por responsável" })).toBeTruthy();
    expect(screen.getByText(/Referência: 26\/10\/2026/)).toBeTruthy();
  });
  it("applies all filter categories through service, not local rows", async () => {
    renderPage();
    await loaded();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Buscar por número"), "0042");
    fireEvent.change(screen.getByLabelText("Data limite — de"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("Data limite — até"), {
      target: { value: "2026-10-26" },
    });
    await user.selectOptions(screen.getByLabelText("Técnico"), "technician-1");
    await user.selectOptions(screen.getByLabelText("Responsável"), "manager-1");
    await user.selectOptions(screen.getByLabelText("Banco"), "bank-1");
    await user.selectOptions(screen.getByLabelText("Situação"), "");
    await user.click(screen.getByLabelText("Somente atrasadas"));
    await user.click(screen.getByLabelText("Sem prazo"));
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() =>
      expect(state.service.report).toHaveBeenLastCalledWith(
        expect.objectContaining({
          query: "0042",
          startDate: "2026-10-01",
          endDate: "2026-10-26",
          technician: "technician-1",
          responsible: "manager-1",
          bankId: "bank-1",
          status: "",
          onlyOverdue: true,
          withoutDeadline: true,
        }),
        1,
        expect.anything(),
      ),
    );
  });
  it("shows an empty state without hiding adoption action", async () => {
    state.service.report.mockResolvedValue({
      ...report,
      totalRows: 0,
      rows: [],
      technicians: [],
      responsibles: [],
    });
    renderPage();
    expect(await screen.findByText(/Nenhuma proposta encontrada/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Adicionar acompanhamento" }),
    ).toBeTruthy();
  });
  it("shows error and supports retry", async () => {
    state.service.report.mockRejectedValueOnce(new Error("Falha de rede QA"));
    renderPage();
    expect(await screen.findByText("Falha de rede QA")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Tentar novamente" }),
    );
    await loaded();
    expect(state.service.report).toHaveBeenCalledTimes(2);
  });
  it("hides all monetary outputs if financial permission is absent, even on stale data", async () => {
    state.permissions = ["proposal_reports.read"];
    renderPage();
    const table = await loaded();
    expect(screen.getByText("Acesso restrito")).toBeTruthy();
    expect(within(table).queryByText("Valor total")).toBeNull();
    expect(screen.queryByText(/500.000/)).toBeNull();
  });
  it("read-only user has no editing controls", async () => {
    state.permissions = ["proposal_reports.read"];
    renderPage();
    await loaded();
    expect(
      screen.queryByRole("button", { name: /Editar acompanhamento/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Adicionar acompanhamento" }),
    ).toBeNull();
  });
  it("manager edits deadline while keeping technician and responsible separate", async () => {
    renderPage();
    await loaded();
    await userEvent.click(
      screen.getByRole("button", { name: "Editar acompanhamento 2026-0042" }),
    );
    fireEvent.change(screen.getByLabelText("Data limite para aprovação"), {
      target: { value: "2026-11-01" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar acompanhamento" }),
    );
    await waitFor(() =>
      expect(state.service.save).toHaveBeenCalledWith(
        row.operationId,
        3,
        expect.objectContaining({
          approvalDeadline: "2026-11-01",
          technicianName: "Andre",
          responsibleName: "Gustavo",
        }),
        expect.objectContaining({ manage: true }),
      ),
    );
  });
  it("approval refreshes and removes proposal from overdue result", async () => {
    renderPage();
    await loaded();
    await userEvent.click(
      screen.getByRole("button", { name: "Editar acompanhamento 2026-0042" }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Situação da aprovação"),
      "approved",
    );
    state.service.report.mockResolvedValue({
      ...report,
      totalRows: 0,
      rows: [],
      technicians: [],
      responsibles: [],
      kpis: {
        ...report.kpis,
        overdueCount: 0,
        overdueAmountTotal: "0",
        averageDays: 0,
        maximumDays: 0,
      },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar acompanhamento" }),
    );
    expect(await screen.findByText(/Nenhuma proposta encontrada/)).toBeTruthy();
    expect(screen.queryByText("2026-0042")).toBeNull();
  });
  it("shows save conflict without closing editor", async () => {
    renderPage();
    await loaded();
    await userEvent.click(
      screen.getByRole("button", { name: "Editar acompanhamento 2026-0042" }),
    );
    state.service.save.mockRejectedValue(
      new Error("Atualize os dados antes de salvar."),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar acompanhamento" }),
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Salvar acompanhamento" }),
    ).toBeTruthy();
  });
  it("adopts only an existing operation and allows no deadline", async () => {
    renderPage();
    await loaded();
    await userEvent.click(
      screen.getByRole("button", { name: "Adicionar acompanhamento" }),
    );
    await screen.findByRole("option", { name: "QA-NEW" });
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /Operação existente/ }),
      "operation-new",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar acompanhamento" }),
    );
    await waitFor(() =>
      expect(state.service.save).toHaveBeenCalledWith(
        "operation-new",
        null,
        expect.objectContaining({
          approvalDeadline: "",
          approvalStatus: "pending",
        }),
        expect.anything(),
      ),
    );
  });
  it("requests next page from server", async () => {
    state.service.report.mockResolvedValue({ ...report, totalRows: 26 });
    renderPage();
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() =>
      expect(state.service.report).toHaveBeenLastCalledWith(
        expect.anything(),
        2,
        expect.anything(),
      ),
    );
  });
  it("ignores stale request after filters change", async () => {
    let resolveOld!: (value: TrackingReport) => void;
    state.service.report.mockReturnValueOnce(
      new Promise<TrackingReport>((resolve) => {
        resolveOld = resolve;
      }),
    );
    renderPage();
    await userEvent.type(screen.getByLabelText("Buscar por número"), "new");
    await userEvent.click(
      screen.getByRole("button", { name: "Aplicar filtros" }),
    );
    await loaded();
    await act(async () =>
      resolveOld({
        ...report,
        rows: [{ ...row, operationNumber: "STALE-QA" }],
      }),
    );
    expect(screen.queryByText("STALE-QA")).toBeNull();
  });
});


it("file action requires proposal_files.read independently from tracking manage", async () => {
  state.permissions = ["proposal_reports.read"];
  const page = renderPage();
  await loaded();
  expect(screen.queryByRole("button", {name: /^Arquivos/})).toBeNull();
  page.unmount();
  state.permissions = ["proposal_reports.read", "proposal_files.read"];
  renderPage();
  await loaded();
  const actions=screen.getAllByRole("button", {name: /^Arquivos/});
  fireEvent.click(actions[0]);
  expect(await screen.findByText(/Arquivos da proposta —/)).toBeTruthy();
  expect(screen.queryByRole("button", {name: /^Editar/})).toBeNull();
});
