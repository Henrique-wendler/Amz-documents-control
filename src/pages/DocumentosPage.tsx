import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Toast, ToastTitle, Toaster, useToastController } from "@fluentui/react-components";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DashboardMessageState } from "../components/dashboard/DashboardState";
import { AttachmentFormDialog } from "../components/documentos/AttachmentFormDialog";
import { DocumentDetailsDrawer } from "../components/documentos/DocumentDetailsDrawer";
import { DocumentFormDrawer } from "../components/documentos/DocumentFormDrawer";
import { DocumentGrid } from "../components/documentos/DocumentGrid";
import { DocumentSummary } from "../components/documentos/DocumentSummary";
import { DocumentToolbar } from "../components/documentos/DocumentToolbar";
import { Header } from "../components/Header";
import { SectionCard } from "../components/SectionCard";
import { Sidebar } from "../components/Sidebar";
import { documentService } from "../services/documentService";
import type { DocumentAttachment } from "../types/domain";
import type { AttachmentDraft, DocumentDetailsViewModel, DocumentDraft, DocumentFilters, DocumentListItem, DocumentListResponse, DocumentLoadMode } from "../types/documento";

interface Props { onNavigate: (path: string) => void; }
type DialogState = { kind: "none" } | { kind: "inactivate"; document: DocumentListItem } | { kind: "delete"; document: DocumentListItem } | { kind: "remove-attachment"; attachment: DocumentAttachment };
const initialFilters: DocumentFilters = { query: "", type: "", status: "all", farmId: "", registrationId: "", exercise: "", purpose: "", attachmentRelation: "all", expirationWindow: "all", page: 1, pageSize: 10 };
const loadMode = (): DocumentLoadMode => { const state = new URLSearchParams(window.location.search).get("state"); return state === "empty" || state === "error" ? state : "success"; };

export function DocumentosPage({ onNavigate }: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [response, setResponse] = useState<DocumentListResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [details, setDetails] = useState<DocumentDetailsViewModel>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [formDocument, setFormDocument] = useState<DocumentListItem>();
  const [formOpen, setFormOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [editingAttachment, setEditingAttachment] = useState<DocumentAttachment>();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [attachmentError, setAttachmentError] = useState<string>();
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const requestId = useRef(0);
  const initialDetailHandled = useRef(false);
  const toasterId = "document-feedback";
  const { dispatchToast } = useToastController(toasterId);
  const farms = documentService.getFarmOptions();
  const registrations = documentService.getRegistrationOptions();
  const types = documentService.getTypeOptions();
  const notify = useCallback((message: string, intent: "success" | "error" | "info" = "success") => dispatchToast(<Toast><ToastTitle>{message}</ToastTitle></Toast>, { intent, timeout: 3200 }), [dispatchToast]);
  const load = useCallback(async (next: DocumentFilters, feedback = false) => { const id = ++requestId.current; setLoading(true); setError(false); try { const result = await documentService.list(next, loadMode()); if (id !== requestId.current) return; setResponse(result); if (result.page !== next.page) setFilters((current) => ({ ...current, page: result.page })); if (feedback) notify("Dados atualizados."); } catch { if (id !== requestId.current) return; setResponse(undefined); setError(true); } finally { if (id === requestId.current) setLoading(false); } }, [notify]);
  useEffect(() => { void load(filters); }, [filters, load]);
  useEffect(() => { const timer = window.setTimeout(() => setFilters((current) => current.query === searchInput ? current : { ...current, query: searchInput, page: 1 }), 300); return () => window.clearTimeout(timer); }, [searchInput]);
  useEffect(() => { if (initialDetailHandled.current || loading || error) return; initialDetailHandled.current = true; const id = new URLSearchParams(window.location.search).get("id"); if (id) void documentService.getDetails(id).then((record) => { setDetails(record); setDetailsOpen(true); }).catch(() => undefined); }, [error, loading]);
  const hasActiveFilters = Boolean(searchInput || filters.type || filters.status !== "all" || filters.farmId || filters.registrationId || filters.exercise || filters.purpose || filters.attachmentRelation !== "all" || filters.expirationWindow !== "all");
  const clearFilters = () => { setSearchInput(""); setFilters(initialFilters); };
  const refreshDetails = async (id?: string) => { const target = id ?? details?.document.id; if (target) setDetails(await documentService.getDetails(target)); };
  const view = async (document: DocumentListItem) => { setDetailsOpen(true); setDetails(await documentService.getDetails(document.id)); };
  const openNew = () => { setFormDocument(undefined); setFormError(undefined); setFormOpen(true); };
  const openEdit = (document: DocumentListItem) => { setDetailsOpen(false); setFormDocument(document); setFormError(undefined); setFormOpen(true); };
  const manageFiles = async (document: DocumentListItem) => { await view(document); setEditingAttachment(undefined); setAttachmentError(undefined); };
  const saveDocument = async (draft: DocumentDraft, pending: AttachmentDraft[]) => { setSaving(true); setFormError(undefined); try { if (formDocument) { await documentService.update(formDocument.id, draft); notify("Documento atualizado com sucesso."); } else { const created = await documentService.create(draft); for (const attachment of pending) await documentService.addAttachment(created.id, attachment); notify("Documento cadastrado com sucesso."); } setFormOpen(false); await load(filters); } catch (reason) { setFormError(reason instanceof Error ? reason.message : "Não foi possível salvar o documento."); } finally { setSaving(false); } };
  const saveAttachment = async (draft: AttachmentDraft) => { if (!details) return; setSaving(true); setAttachmentError(undefined); try { if (editingAttachment) { await documentService.updateAttachment(editingAttachment.id, draft); notify("Referência de arquivo atualizada."); } else { await documentService.addAttachment(details.document.id, draft); notify("Referência de arquivo adicionada."); } setAttachmentOpen(false); setEditingAttachment(undefined); await refreshDetails(); await load(filters); } catch (reason) { setAttachmentError(reason instanceof Error ? reason.message : "Não foi possível salvar a referência."); } finally { setSaving(false); } };
  const copyPath = async (attachment: DocumentAttachment) => { try { await navigator.clipboard.writeText(attachment.filePath); notify("Caminho copiado para a área de transferência.", "info"); } catch { notify("Não foi possível copiar o caminho.", "error"); } };
  const confirmAction = async () => { if (dialog.kind === "none") return; if (dialog.kind === "inactivate") { await documentService.inactivate(dialog.document.id); notify("Documento inativado."); if (details?.document.id === dialog.document.id) await refreshDetails(); } else if (dialog.kind === "delete") { await documentService.delete(dialog.document.id); notify("Documento excluído do protótipo."); if (details?.document.id === dialog.document.id) setDetailsOpen(false); } else { await documentService.removeAttachment(dialog.attachment.id); notify("Referência de arquivo removida."); await refreshDetails(); } setDialog({ kind: "none" }); await load(filters); };
  const dialogConfig = dialog.kind === "inactivate" ? { title: "Inativar documento?", message: "O documento permanecerá no histórico, com situação cadastral inativa.", confirmLabel: "Inativar", danger: false }
    : dialog.kind === "delete" ? { title: "Excluir documento?", message: `O registro e ${dialog.document.attachmentCount} referência${dialog.document.attachmentCount === 1 ? "" : "s"} serão removidos do protótipo. Nenhum arquivo físico será excluído.`, confirmLabel: "Excluir", danger: true }
    : dialog.kind === "remove-attachment" ? { title: "Remover referência?", message: `A referência ${dialog.attachment.fileName} será removida do protótipo. O arquivo físico não será alterado.`, confirmLabel: "Remover", danger: true } : undefined;
  return <div className="app-shell"><Sidebar activePath="/documentos" onNavigate={onNavigate} /><div className="app-workspace"><Header title="Documentos" subtitle="Gestão documental dos imóveis rurais e referências de arquivos em rede" refreshing={loading} onRefresh={() => void load(filters, true)} /><main className="main-content documentos-content"><DocumentSummary value={response?.summary} /><section className="section-card document-search-panel" aria-label="Busca e filtros de documentos"><DocumentToolbar query={searchInput} value={filters} types={types} farms={farms} registrations={registrations} hasActiveFilters={hasActiveFilters} onQueryChange={setSearchInput} onChange={setFilters} onClear={clearFilters} onNew={openNew} /></section>{error ? <DashboardMessageState kind="error" title="Não foi possível carregar os documentos" description="Tente carregar novamente a gestão documental." onRetry={() => void load(filters)} /> : <SectionCard className="document-results-card" title={`${response?.total ?? 0} documento${response?.total === 1 ? "" : "s"}`} subtitle="Validade temporal calculada com referência em 21/08/2026" action={<Badge appearance="tint" color="subtle">10 por página</Badge>}><DocumentGrid records={response?.records ?? []} loading={loading} filtered={hasActiveFilters} page={response?.page ?? filters.page} totalPages={response?.totalPages ?? 1} onView={(item) => void view(item)} onEdit={openEdit} onManageFiles={(item) => void manageFiles(item)} onInactivate={(document) => setDialog({ kind: "inactivate", document })} onDelete={(document) => setDialog({ kind: "delete", document })} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} onClear={clearFilters} onNew={openNew} /></SectionCard>}</main></div>
    <DocumentDetailsDrawer record={details} open={detailsOpen} onClose={() => setDetailsOpen(false)} onEdit={() => { if (details) openEdit(details.document); }} onAddAttachment={() => { setEditingAttachment(undefined); setAttachmentError(undefined); setAttachmentOpen(true); }} onEditAttachment={(attachment) => { setEditingAttachment(attachment); setAttachmentError(undefined); setAttachmentOpen(true); }} onCopyPath={(attachment) => void copyPath(attachment)} onRemoveAttachment={(attachment) => setDialog({ kind: "remove-attachment", attachment })} />
    <DocumentFormDrawer open={formOpen} document={formDocument} attachments={formDocument?.id === details?.document.id ? details?.attachments ?? [] : []} farms={farms} registrations={registrations} types={types} saving={saving} serviceError={formError} onClose={() => { if (!saving) setFormOpen(false); }} onSave={(draft, pending) => void saveDocument(draft, pending)} />
    <AttachmentFormDialog open={attachmentOpen} value={editingAttachment} saving={saving} serviceError={attachmentError} onClose={() => { if (!saving) setAttachmentOpen(false); }} onSave={(draft) => void saveAttachment(draft)} />
    <Toaster toasterId={toasterId} position="top-end" />{dialogConfig ? <ConfirmDialog open title={dialogConfig.title} message={dialogConfig.message} confirmLabel={dialogConfig.confirmLabel} danger={dialogConfig.danger} onCancel={() => setDialog({ kind: "none" })} onConfirm={() => void confirmAction()} /> : null}
  </div>;
}
