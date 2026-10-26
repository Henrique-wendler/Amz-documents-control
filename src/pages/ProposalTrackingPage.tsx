import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  Select,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from "@fluentui/react-components";
import { Header } from "../components/Header";
import { Sidebar } from "../components/Sidebar";
import { SectionCard } from "../components/SectionCard";
import { KpiCard } from "../components/dashboard/KpiCard";
import { DashboardMessageState } from "../components/dashboard/DashboardState";
import { TrackingGroups } from "../components/proposal-tracking/TrackingGroups";
import { TrackingEditor } from "../components/proposal-tracking/TrackingEditor";
import { usePermissions } from "../hooks/usePermissions";
import { proposalTrackingService } from "../services/proposalTrackingService";
import { initialTrackingFilters } from "../services/proposalTrackingServiceCore";
import {
  approvalLabels,
  trackingCurrency,
  trackingDate,
  trackingDays,
} from "../services/proposalTrackingPresentation";
import type {
  ApprovalStatus,
  TrackingAccess,
  TrackingEntry,
  TrackingFilters,
  TrackingOptions,
  TrackingReport,
} from "../types/proposalTracking";
interface Props {
  onNavigate: (path: string) => void;
}
export function ProposalTrackingPage({ onNavigate }: Props) {
  const { hasPermission } = usePermissions();
  const read = hasPermission("proposal_reports.read"),
    financial = hasPermission("proposal_reports.financial"),
    manage = hasPermission("proposal_tracking.manage");
  const access = useMemo(
    () => ({ read, financial, manage }),
    [read, financial, manage],
  );
  if (!read)
    return (
      <div className="app-shell">
        <Sidebar
          activePath="/acompanhamento-propostas"
          onNavigate={onNavigate}
        />
        <div className="app-workspace">
          <Header
            title="Acompanhamento de Propostas"
            onRefresh={() => undefined}
          />
          <main className="main-content">
            <p role="alert">
              Você não possui permissão para acessar o acompanhamento gerencial
              de propostas.
            </p>
          </main>
        </div>
      </div>
    );
  return <TrackingContent access={access} onNavigate={onNavigate} />;
}
function TrackingContent({
  access,
  onNavigate,
}: Props & { access: TrackingAccess }) {
  const [filters, setFilters] = useState<TrackingFilters>(
    initialTrackingFilters,
  );
  const [draftFilters, setDraftFilters] = useState<TrackingFilters>(
    initialTrackingFilters,
  );
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<TrackingReport>();
  const [options, setOptions] = useState<TrackingOptions>({
    banks: [],
    technicians: [],
    responsibles: [],
    profiles: [],
  });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [editor, setEditor] = useState<TrackingEntry | "new">();
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const [data, choices] = await Promise.all([
        proposalTrackingService.report(filters, page, access),
        proposalTrackingService.options(access),
      ]);
      if (request.current === id) {
        setReport(data);
        setOptions(choices);
      }
    } catch (reason) {
      if (request.current === id) {
        setReport(undefined);
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível carregar o acompanhamento.",
        );
      }
    } finally {
      if (request.current === id) setLoading(false);
    }
  }, [filters, page, access]);
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [load]);
  const financial = access.financial && report?.financialAccess === true;
  const kpis = report
    ? [
        {
          id: "overdue",
          label: "Propostas atrasadas",
          value: String(report.kpis.overdueCount),
          detail: "Aguardando aprovação além da data limite",
          icon: "pending" as const,
          tone: "warning" as const,
        },
        {
          id: "amount",
          label: "Valor não ganho",
          value: financial
            ? trackingCurrency(report.kpis.overdueAmountTotal)
            : "Acesso restrito",
          detail: "Valor total das operações em atraso.",
          icon: "operation" as const,
          tone: "neutral" as const,
        },
        {
          id: "average",
          label: "Atraso médio",
          value: trackingDays(report.kpis.averageDays),
          detail: "Entre as propostas atualmente atrasadas",
          icon: "pending" as const,
          tone: "neutral" as const,
        },
        {
          id: "maximum",
          label: "Maior atraso",
          value: trackingDays(report.kpis.maximumDays),
          detail: "Entre as propostas atualmente atrasadas",
          icon: "pending" as const,
          tone: "neutral" as const,
        },
        {
          id: "missing",
          label: "Sem prazo definido",
          value: String(report.kpis.withoutDeadlineCount),
          detail: "Aguardando aprovação, sem data limite",
          icon: "operation" as const,
          tone: "neutral" as const,
        },
      ]
    : [];
  const textFilter = (
    key: "startDate" | "endDate" | "query",
    label: string,
    type: "text" | "date" = "text",
  ) => (
    <Field label={label}>
      <Input
        type={type}
        value={draftFilters[key]}
        maxLength={100}
        onChange={(_, data) =>
          setDraftFilters((current) => ({ ...current, [key]: data.value }))
        }
      />
    </Field>
  );
  return (
    <div className="app-shell">
      <Sidebar activePath="/acompanhamento-propostas" onNavigate={onNavigate} />
      <div className="app-workspace">
        <Header
          title="Acompanhamento de Propostas"
          subtitle="Aprovação, prazos e acompanhamento gerencial"
          refreshing={loading}
          onRefresh={() => void load()}
        />
        <main className="main-content tracking-page">
          <SectionCard
            title="Filtros"
            subtitle="O período considera a data limite para aprovação. Datas operacionais: America/Araguaina."
          >
            <form
              className="tracking-filters"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setFilters({ ...draftFilters });
              }}
            >
              {textFilter("query", "Buscar por número")}
              {textFilter("startDate", "Data limite — de", "date")}
              {textFilter("endDate", "Data limite — até", "date")}
              <Field label="Técnico">
                <Select
                  value={draftFilters.technician}
                  onChange={(_, data) =>
                    setDraftFilters((current) => ({
                      ...current,
                      technician: data.value,
                    }))
                  }
                >
                  <option value="">Todos os técnicos</option>
                  {options.technicians.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name || "Sem vínculo definido"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Responsável">
                <Select
                  value={draftFilters.responsible}
                  onChange={(_, data) =>
                    setDraftFilters((current) => ({
                      ...current,
                      responsible: data.value,
                    }))
                  }
                >
                  <option value="">Todos os responsáveis</option>
                  {options.responsibles.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name || "Sem vínculo definido"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Banco">
                <Select
                  value={draftFilters.bankId}
                  onChange={(_, data) =>
                    setDraftFilters((current) => ({
                      ...current,
                      bankId: data.value,
                    }))
                  }
                >
                  <option value="">Todos os bancos</option>
                  {options.banks.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Situação">
                <Select
                  value={draftFilters.status}
                  onChange={(_, data) =>
                    setDraftFilters((current) => ({
                      ...current,
                      status: data.value as ApprovalStatus | "",
                    }))
                  }
                >
                  <option value="">Todas as situações</option>
                  {Object.entries(approvalLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Checkbox
                label="Somente atrasadas"
                checked={draftFilters.onlyOverdue}
                onChange={(_, data) =>
                  setDraftFilters((current) => ({
                    ...current,
                    onlyOverdue: data.checked === true,
                  }))
                }
              />
              <Checkbox
                label="Sem prazo"
                checked={draftFilters.withoutDeadline}
                onChange={(_, data) =>
                  setDraftFilters((current) => ({
                    ...current,
                    withoutDeadline: data.checked === true,
                  }))
                }
              />
              <Button appearance="primary" type="submit">
                Aplicar filtros
              </Button>
              <Button
                onClick={() => {
                  setDraftFilters(initialTrackingFilters);
                  setFilters({ ...initialTrackingFilters });
                  setPage(1);
                }}
              >
                Limpar filtros
              </Button>
            </form>
          </SectionCard>
          {access.manage && (
            <div>
              <Button appearance="primary" onClick={() => setEditor("new")}>
                Adicionar acompanhamento
              </Button>
            </div>
          )}
          {loading ? (
            <Spinner label="Carregando acompanhamento de propostas…" />
          ) : error ? (
            <DashboardMessageState
              kind="error"
              title="Não foi possível carregar o acompanhamento"
              description={error}
              onRetry={() => void load()}
            />
          ) : (
            report && (
              <>
                <div className="dashboard-kpis tracking-kpis">
                  {kpis.map((item) => (
                    <KpiCard key={item.id} item={item} />
                  ))}
                </div>
                <p className="tracking-reference-date">
                  Referência: {trackingDate(report.today)} · Os indicadores
                  respeitam os filtros aplicados. Atraso em dias corridos.
                </p>
                <div className="tracking-groups">
                  <TrackingGroups
                    title="Por técnico"
                    heading="Técnico"
                    groups={report.technicians}
                    financial={financial}
                  />
                  <TrackingGroups
                    title="Por responsável"
                    heading="Responsável"
                    groups={report.responsibles}
                    financial={financial}
                  />
                </div>
                <SectionCard
                  title="Propostas acompanhadas"
                  subtitle={`${report.totalRows} registro(s) · Maior atraso primeiro`}
                >
                  {!report.rows.length ? (
                    <p role="status">
                      Nenhuma proposta encontrada para os filtros selecionados.
                    </p>
                  ) : (
                    <div className="tracking-table-scroll">
                      <Table aria-label="Propostas acompanhadas" size="small">
                        <TableHeader>
                          <TableRow>
                            {[
                              "Número / identificação",
                              "Banco",
                              "Finalidade",
                              "Técnico",
                              "Responsável",
                              "Situação",
                              "Data limite",
                              "Dias de atraso",
                              ...(financial ? ["Valor total"] : []),
                              "Motivo",
                              "Última atualização",
                              ...(access.manage ? ["Ações"] : []),
                            ].map((label) => (
                              <TableHeaderCell key={label}>
                                {label}
                              </TableHeaderCell>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.rows.map((row) => (
                            <TableRow key={row.operationId}>
                              <TableCell>{row.operationNumber}</TableCell>
                              <TableCell>{row.bankName}</TableCell>
                              <TableCell>{row.purpose || "—"}</TableCell>
                              <TableCell>{row.technicianName || "—"}</TableCell>
                              <TableCell>
                                {row.responsibleName || "—"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  appearance="tint"
                                  color={
                                    row.overdueDays > 0
                                      ? "danger"
                                      : "informative"
                                  }
                                >
                                  {row.overdueDays > 0
                                    ? "Atrasada"
                                    : approvalLabels[row.approvalStatus]}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {trackingDate(row.approvalDeadline)}
                              </TableCell>
                              <TableCell>
                                {trackingDays(row.overdueDays)}
                              </TableCell>
                              {financial && (
                                <TableCell>
                                  {trackingCurrency(row.amount)}
                                </TableCell>
                              )}
                              <TableCell className="tracking-reason">
                                {row.delayReason || "—"}
                              </TableCell>
                              <TableCell>
                                {trackingDate(row.updatedAt)}
                              </TableCell>
                              {access.manage && (
                                <TableCell>
                                  <Button
                                    size="small"
                                    aria-label={`Editar acompanhamento ${row.operationNumber}`}
                                    onClick={() => setEditor(row)}
                                  >
                                    Editar
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <div className="tracking-pagination">
                    <Button
                      disabled={page <= 1}
                      onClick={() => setPage((current) => current - 1)}
                    >
                      Anterior
                    </Button>
                    <span>
                      Página {report.page} de{" "}
                      {Math.max(
                        1,
                        Math.ceil(report.totalRows / report.pageSize),
                      )}
                    </span>
                    <Button
                      disabled={page * report.pageSize >= report.totalRows}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </SectionCard>
              </>
            )
          )}
          {access.manage && editor && (
            <TrackingEditor
              key={editor === "new" ? "new" : editor.operationId}
              entry={editor === "new" ? undefined : editor}
              profiles={options.profiles}
              access={access}
              onClose={() => setEditor(undefined)}
              onSaved={() => {
                setEditor(undefined);
                setPage(1);
                void load();
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
