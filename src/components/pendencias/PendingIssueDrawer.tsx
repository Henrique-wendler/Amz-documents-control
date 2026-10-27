import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Badge, Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeaderTitle,
  Field, Input, Select, Spinner, Textarea,
} from "@fluentui/react-components";
import { Dismiss24Regular } from "@fluentui/react-icons";
import { EntityChips } from "../EntityChips";
import {
  assigneeOptions, formatCivilDate, formatInternalTime, formatIssueAmount, formatSourceTime,
  formatTimestamp, pendingIssueEventLabels, pendingIssueStatusLabels, pendingIssueTypeLabels,
  requiresJustification,
} from "../../services/pendingIssuePresentation";
import type {
  PendingIssue, PendingIssueAssignee, PendingIssueEvent, PendingIssueManagement,
  PendingIssueStatus, PendingIssueUpdate,
} from "../../types/pendingIssue";

type Draft = Pick<PendingIssueUpdate, "assignedTo" | "status" | "resolutionDueDate" | "justification">;

interface Props {
  open: boolean;
  issue?: PendingIssue;
  management?: PendingIssueManagement;
  events: PendingIssueEvent[];
  hasMoreEvents: boolean;
  loading: boolean;
  loadingMore: boolean;
  saving: boolean;
  noteSaving: boolean;
  canManage: boolean;
  financialVisible: boolean;
  assignees: PendingIssueAssignee[];
  error?: string;
  onClose: () => void;
  onRetry: () => void;
  onSave: (draft: Draft) => void;
  onAddNote: (note: string) => Promise<boolean>;
  onLoadMore: () => void;
}

const statuses: PendingIssueStatus[] = ["open", "in_analysis", "in_progress", "resolved", "justified"];
const initialDraft: Draft = { assignedTo: null, status: "open", resolutionDueDate: null, justification: null };
const relationLabels = { operation: "operação", guarantee: "garantia", document: "documento" } as const;
const statusKeys = new Set<PendingIssueStatus>(statuses);

const eventChange = (event: PendingIssueEvent, assignees: PendingIssueAssignee[]) => {
  const previous = event.metadata.old;
  const next = event.metadata.new;
  if (event.type === "status_changed" || event.type === "resolved" || event.type === "justified" || event.type === "reopened") {
    if (typeof previous === "string" && typeof next === "string"
      && statusKeys.has(previous as PendingIssueStatus) && statusKeys.has(next as PendingIssueStatus))
      return `${pendingIssueStatusLabels[previous as PendingIssueStatus]} → ${pendingIssueStatusLabels[next as PendingIssueStatus]}`;
  }
  if (event.type === "deadline_changed") {
    const before = typeof previous === "string" ? formatCivilDate(previous) : "Sem prazo";
    const after = typeof next === "string" ? formatCivilDate(next) : "Sem prazo";
    return `${before} → ${after}`;
  }
  if (event.type === "assigned") {
    const name = typeof next === "string" ? assignees.find((person) => person.id === next)?.name : undefined;
    return name ? `Atribuída a ${name}` : next === null ? "Atribuição removida" : undefined;
  }
  return undefined;
};

export function PendingIssueDrawer({
  open, issue, management, events, hasMoreEvents, loading, loadingMore, saving, noteSaving,
  canManage, financialVisible, assignees, error, onClose, onRetry, onSave, onAddNote, onLoadMore,
}: Props) {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [note, setNote] = useState("");
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (!management) return;
    setDraft({
      assignedTo: management.assignedTo, status: management.status,
      resolutionDueDate: management.resolutionDueDate, justification: management.justification,
    });
    setValidationError("");
  }, [management?.id, management?.version]);

  const responsibleName = management?.assignedTo
    ? assignees.find((person) => person.id === management.assignedTo)?.name
      ?? (issue?.assignedTo === management.assignedTo ? issue.responsibleName : null)
      ?? "Responsável indisponível"
    : "Sem responsável";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (requiresJustification(draft.status, draft.justification)) {
      setValidationError("Informe a justificativa para marcar a pendência como justificada.");
      return;
    }
    setValidationError("");
    onSave({ ...draft, justification: draft.status === "justified" ? draft.justification?.trim() ?? null : null });
  };

  return <Drawer className="search-result-drawer pending-drawer" type="overlay" position="end" size="large" open={open}
    onOpenChange={(_, data) => { if (!data.open && !saving) onClose(); }}>
    <DrawerHeader><DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Fechar detalhes" icon={<Dismiss24Regular />} onClick={onClose} />}>
      Detalhes da pendência
    </DrawerHeaderTitle></DrawerHeader>
    <DrawerBody>
      {loading ? <div className="pending-drawer__loading"><Spinner label="Carregando pendência…" /></div> : null}
      {!loading && !management ? <div className="pending-drawer__loading"><p>{error ?? "Não foi possível abrir esta pendência."}</p><Button onClick={onRetry}>Tentar novamente</Button></div> : null}
      {!loading && issue && management ? <div className="pending-drawer__content">
        <section className="pending-drawer__section">
          <div className="pending-drawer__heading"><h3>{pendingIssueTypeLabels[issue.type]}</h3>
            <Badge appearance="tint" color={management.status === "resolved" ? "success" : "warning"}>{pendingIssueStatusLabels[management.status]}</Badge>
            <Badge appearance="tint" color={issue.currentlyDetected ? "warning" : "subtle"}>{issue.currentlyDetected ? "Detectada atualmente" : "Não detectada atualmente"}</Badge></div>
          {issue.needsReopenReview ? <p className="pending-drawer__review">Revisão de reabertura</p> : null}
          <p>{issue.sourceName ?? "Ocorrência vinculada ao cadastro"}</p>
        </section>

        <section className="pending-drawer__section"><h3>Contexto</h3>
          <dl className="pending-drawer__facts">
            <div><dt>Origem</dt><dd>{issue.sourceName ?? "—"}</dd></div>
            <div><dt>Operação</dt><dd>{issue.operationNumber ?? "—"}</dd></div>
            <div><dt>Instituição</dt><dd>{issue.institutionName ?? "—"}</dd></div>
            <div><dt>Fazendas</dt><dd><EntityChips items={issue.farms.map((farm) => ({ id: farm.id, label: farm.name, detail: `${farm.name} · ${farm.municipality ?? "Município não informado"}/${farm.state ?? "UF não informada"}` }))} /></dd></div>
            <div><dt>Matrículas</dt><dd><EntityChips items={issue.registrations.map((registration) => ({ id: `${registration.relation}-${registration.id}`, label: registration.number, detail: `${registration.number} · vínculo com ${relationLabels[registration.relation]}` }))} /></dd></div>
            <div><dt>Proprietários</dt><dd><EntityChips items={issue.owners.map((owner) => ({ id: owner.id, label: owner.name }))} /></dd></div>
          </dl>
        </section>

        <section className="pending-drawer__section"><h3>Impacto e datas</h3>
          <dl className="pending-drawer__facts">
            <div><dt>Data da origem</dt><dd>{formatCivilDate(issue.sourceDate)}</dd></div>
            <div><dt>Tempo do problema</dt><dd>{formatSourceTime(issue)}</dd></div>
            <div><dt>Valor associado</dt><dd>{formatIssueAmount(issue, financialVisible)}</dd></div>
            <div><dt>Responsável</dt><dd>{responsibleName}</dd></div>
            <div><dt>Prazo interno</dt><dd>{formatCivilDate(management.resolutionDueDate)} · {management.resolutionDueDate === issue.resolutionDueDate ? formatInternalTime(issue) : "Prazo atualizado"}</dd></div>
            <div><dt>Identificada em</dt><dd>{formatTimestamp(issue.identifiedAt)}</dd></div>
            <div><dt>Atualizada em</dt><dd>{formatTimestamp(management.updatedAt)}</dd></div>
          </dl>
        </section>

        {canManage ? <section className="pending-drawer__section pending-drawer__section--action"><h3>Gerenciar acompanhamento</h3>
          <form id="pending-management-form" className="pending-drawer__form" onSubmit={submit}>
            <Field label="Responsável"><Select aria-label="Responsável" value={draft.assignedTo ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, assignedTo: event.target.value || null }))}>
              <option value="">Sem responsável</option>
              {assigneeOptions(assignees, management.assignedTo, issue.responsibleName)
                .map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}
            </Select></Field>
            <Field label="Status"><Select aria-label="Status" value={draft.status}
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as PendingIssueStatus,
                justification: event.target.value === "justified" ? current.justification : null }))}>
              {statuses.map((status) => <option key={status} value={status}>{pendingIssueStatusLabels[status]}</option>)}
            </Select></Field>
            <Field label="Prazo de resolução"><Input aria-label="Prazo de resolução" type="date" value={draft.resolutionDueDate ?? ""}
              onChange={(_, data) => setDraft((current) => ({ ...current, resolutionDueDate: data.value || null }))} /></Field>
            {draft.status === "justified" ? <Field label="Justificativa" required><Textarea value={draft.justification ?? ""}
              onChange={(_, data) => setDraft((current) => ({ ...current, justification: data.value }))} /></Field> : null}
            {validationError ? <p className="pending-drawer__error" role="alert">{validationError}</p> : null}
            {error ? <p className="pending-drawer__error" role="alert">{error}</p> : null}
            <Button appearance="primary" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar acompanhamento"}</Button>
          </form>
        </section> : null}

        <section className="pending-drawer__section"><h3>Histórico</h3><p>Eventos mais recentes primeiro.</p>
          {events.length ? <ol className="pending-timeline">{events.map((event) => <li key={event.id}>
            <strong>{pendingIssueEventLabels[event.type]}</strong><time>{formatTimestamp(event.createdAt)}</time>
            {eventChange(event, assignees) ? <p>{eventChange(event, assignees)}</p> : null}
            {event.note ? <p>{event.note}</p> : null}
          </li>)}</ol> : <p>Nenhum evento disponível.</p>}
          {hasMoreEvents ? <Button appearance="subtle" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "Carregando…" : "Carregar mais"}</Button> : null}
          {canManage ? <div className="pending-drawer__note"><Field label="Nova observação"><Textarea value={note}
            onChange={(_, data) => setNote(data.value)} /></Field>
            <Button appearance="secondary" disabled={noteSaving || !note.trim()} onClick={() => void onAddNote(note.trim()).then((saved) => { if (saved) setNote(""); })}>
              {noteSaving ? "Adicionando…" : "Adicionar observação"}</Button></div> : null}
        </section>
      </div> : null}
    </DrawerBody>
    <DrawerFooter><Button appearance="secondary" onClick={onClose}>Fechar</Button></DrawerFooter>
  </Drawer>;
}
