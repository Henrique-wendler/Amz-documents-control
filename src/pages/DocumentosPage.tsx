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
import { documentFileService, documentUploadAccept } from "../services/documentFileService";
import { documentService } from "../services/documentService";
import type { AttachmentDraft, DocumentAttachmentView, DocumentDetailsViewModel, DocumentDraft, DocumentFilters, DocumentListItem, DocumentListResponse, DocumentLoadMode, DocumentOption, DocumentTypeOption } from "../types/documento";
import { usePermissions } from "../hooks/usePermissions";

interface Props { onNavigate: (path: string) => void; }
type DialogState = { kind: "none" } | { kind: "inactivate"; document: DocumentListItem } | { kind: "delete"; document: DocumentListItem } | { kind: "remove-attachment"; attachment: DocumentAttachmentView } | { kind: "remove-cloud-location"; attachment: DocumentAttachmentView; locationId: string; version: number };
const initialFilters: DocumentFilters = { query: "", type: "", status: "all", farmId: "", registrationId: "", exercise: "", purpose: "", attachmentRelation: "all", expirationWindow: "all", page: 1, pageSize: 10 };
const loadMode = (): DocumentLoadMode => { const state = new URLSearchParams(window.location.search).get("state"); return state === "empty" || state === "error" ? state : "success"; };

export function DocumentosPage({ onNavigate }: Props) {
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("documents.write");
  const canInactivate = hasPermission("documents.inactivate");
  const canDelete = hasPermission("documents.soft_delete");
  const canReadFiles = hasPermission("files.read");
  const canManageFiles = hasPermission("files.manage");
  const canRemoveFiles = hasPermission("files.soft_delete");
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
  const [editingAttachment, setEditingAttachment] = useState<DocumentAttachmentView>();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [attachmentError, setAttachmentError] = useState<string>();
  const [fileUploading, setFileUploading] = useState(false);
  const [remoteCopyingLocationId, setRemoteCopyingLocationId] = useState<string>();
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [farms, setFarms] = useState<DocumentOption[]>([]);
  const [registrations, setRegistrations] = useState<DocumentOption[]>([]);
  const [types, setTypes] = useState<DocumentTypeOption[]>([]);
  const requestId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const initialDetailHandled = useRef(false);
  const toasterId = "document-feedback";
  const { dispatchToast } = useToastController(toasterId);
  const notify = useCallback((message: string, intent: "success" | "error" | "info" = "success") => dispatchToast(<Toast><ToastTitle>{message}</ToastTitle></Toast>, { intent, timeout: 3200 }), [dispatchToast]);
  const load = useCallback(async (next: DocumentFilters, feedback = false) => { const id = ++requestId.current; setLoading(true); setError(false); try { const result = await documentService.list(next, loadMode()); if (id !== requestId.current) return; setResponse(result); if (result.page !== next.page) setFilters((current) => ({ ...current, page: result.page })); if (feedback) notify("Dados atualizados."); } catch { if (id !== requestId.current) return; setResponse(undefined); setError(true); } finally { if (id === requestId.current) setLoading(false); } }, [notify]);
  useEffect(() => { void load(filters); }, [filters, load]);
  useEffect(() => { void Promise.all([documentService.getFarmOptions(), documentService.getRegistrationOptions(), documentService.getTypeOptions()]).then(([farmOptions, registrationOptions, typeOptions]) => { setFarms(farmOptions); setRegistrations(registrationOptions); setTypes(typeOptions); }).catch(() => setError(true)); }, []);
  useEffect(() => { const timer = window.setTimeout(() => setFilters((current) => current.query === searchInput ? current : { ...current, query: searchInput, page: 1 }), 300); return () => window.clearTimeout(timer); }, [searchInput]);
  useEffect(() => { if (initialDetailHandled.current || loading || error) return; initialDetailHandled.current = true; const params = new URLSearchParams(window.location.search); const id = params.get("open") ?? params.get("id"); if (id) void documentService.getDetails(id, canReadFiles).then((record) => { setDetails(record); setDetailsOpen(true); }).catch(() => undefined); }, [canReadFiles, error, loading]);
  const remoteCopyPending = details?.attachments.some((attachment) => attachment.locations.some((location) => location.remoteCopyStatus === "pending" || location.remoteCopyStatus === "processing")) ?? false;
  useEffect(() => {
    const documentId = details?.document.id;
    if (!detailsOpen || !documentId || !remoteCopyPending) return;
    const timer = window.setInterval(() => {
      void documentService.getDetails(documentId, canReadFiles).then(setDetails).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [canReadFiles, details?.document.id, detailsOpen, remoteCopyPending]);
  const hasActiveFilters = Boolean(searchInput || filters.type || filters.status !== "all" || filters.farmId || filters.registrationId || filters.exercise || filters.purpose || filters.attachmentRelation !== "all" || filters.expirationWindow !== "all");
  const clearFilters = () => { setSearchInput(""); setFilters(initialFilters); };
  const refreshDetails = async (id?: string) => { const target = id ?? details?.document.id; if (target) setDetails(await documentService.getDetails(target, canReadFiles)); };
  const view = async (document: DocumentListItem) => { setDetailsOpen(true); setDetails(await documentService.getDetails(document.id, canReadFiles)); };
  const openNew = () => { setFormDocument(undefined); setFormError(undefined); setFormOpen(true); };
  const openEdit = (document: DocumentListItem) => { setDetailsOpen(false); setFormDocument(document); setFormError(undefined); setFormOpen(true); };
  const manageFiles = async (document: DocumentListItem) => { await view(document); setEditingAttachment(undefined); setAttachmentError(undefined); };
  const saveDocument = async (draft: DocumentDraft, pending: AttachmentDraft[]) => { setSaving(true); setFormError(undefined); try { if (formDocument) { await documentService.update(formDocument.id, formDocument.version, draft); notify("Documento atualizado com sucesso."); } else { const created = await documentService.create(draft); for (const attachment of pending) await documentService.addAttachment(created.id, attachment); notify("Documento cadastrado com sucesso."); } setFormOpen(false); await load(filters); } catch (reason) { setFormError(reason instanceof Error ? reason.message : "Não foi possível salvar o documento."); } finally { setSaving(false); } };
  const saveAttachment = async (draft: AttachmentDraft) => { if (!details) return; setSaving(true); setAttachmentError(undefined); try { if (editingAttachment) { await documentService.updateAttachment(editingAttachment.id, editingAttachment.version, draft); notify("Referência de arquivo atualizada."); } else { await documentService.addAttachment(details.document.id, draft); notify("Referência de arquivo adicionada."); } setAttachmentOpen(false); setEditingAttachment(undefined); await refreshDetails(); await load(filters); } catch (reason) { setAttachmentError(reason instanceof Error ? reason.message : "Não foi possível salvar a referência."); } finally { setSaving(false); } };
  const uploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!file || !details) return; setFileUploading(true); try { await documentFileService.upload(details.document.id, file); notify("Arquivo enviado e verificado com sucesso."); await refreshDetails(); await load(filters); } catch (reason) { notify(reason instanceof Error ? reason.message : "Não foi possível enviar o arquivo.", "error"); } finally { setFileUploading(false); } };
  const downloadFile = async (locationId: string) => { try { await documentFileService.download(locationId); notify("Download autorizado por 60 segundos.", "info"); } catch (reason) { notify(reason instanceof Error ? reason.message : "Não foi possível abrir o arquivo.", "error"); } };
  const requestRemoteCopy = async (attachment: DocumentAttachmentView, sourceLocationId: string) => {
    setRemoteCopyingLocationId(sourceLocationId);
    try {
      const result = await documentFileService.requestRemoteCopy(attachment.id, sourceLocationId);
      notify(result.status === "completed" ? "Arquivo já está disponível remotamente." : "Disponibilização remota solicitada.", result.status === "completed" ? "success" : "info");
      await refreshDetails();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Não foi possível solicitar a disponibilização remota.", "error");
    } finally {
      setRemoteCopyingLocationId(undefined);
    }
  };
  const confirmAction = async () => { if (dialog.kind === "none") return; try { if (dialog.kind === "inactivate") { await documentService.inactivate(dialog.document.id, dialog.document.version); notify("Documento inativado."); if (details?.document.id === dialog.document.id) await refreshDetails(); } else if (dialog.kind === "delete") { await documentService.delete(dialog.document.id, dialog.document.version); notify("Documento excluído."); if (details?.document.id === dialog.document.id) setDetailsOpen(false); } else if (dialog.kind === "remove-cloud-location") { await documentFileService.removeLocation(dialog.locationId, dialog.version); notify("Localização Cloud removida."); await refreshDetails(); } else { await documentService.removeAttachment(dialog.attachment.id, dialog.attachment.version); notify("Referência de arquivo removida."); await refreshDetails(); } setDialog({ kind: "none" }); await load(filters); } catch (reason) { setDialog({ kind: "none" }); notify(reason instanceof Error ? reason.message : "Não foi possível concluir a ação.", "error"); } };
  const dialogConfig = dialog.kind === "inactivate" ? { title: "Inativar documento?", message: "O documento permanecerá no histórico, com situação cadastral inativa.", confirmLabel: "Inativar", danger: false }
    : dialog.kind === "delete" ? { title: "Excluir documento?", message: "O registro será removido logicamente. Referências de arquivo devem ser removidas antes.", confirmLabel: "Excluir", danger: true }
    : dialog.kind === "remove-attachment" ? { title: "Remover referência?", message: `A referência ${dialog.attachment.fileName} será removida logicamente. Nenhum arquivo físico será alterado.`, confirmLabel: "Remover", danger: true }
    : dialog.kind === "remove-cloud-location" ? { title: "Remover arquivo do Cloud?", message: `${dialog.attachment.fileName} deixará de estar disponível remotamente. As demais localizações e o histórico serão preservados.`, confirmLabel: "Remover do Cloud", danger: true } : undefined;
  return <div className="app-shell"><Sidebar activePath="/documentos" onNavigate={onNavigate} /><div className="app-workspace"><Header title="Documentos" subtitle="Gestão documental dos imóveis rurais e referências de arquivos" refreshing={loading} onRefresh={() => void load(filters, true)} /><main className="main-content documentos-content"><DocumentSummary value={response?.summary} /><section className="section-card document-search-panel" aria-label="Busca e filtros de documentos"><DocumentToolbar query={searchInput} value={filters} types={types.map((type) => type.label)} farms={farms} registrations={registrations} hasActiveFilters={hasActiveFilters} canCreate={canWrite} onQueryChange={setSearchInput} onChange={setFilters} onClear={clearFilters} onNew={openNew} /></section>{error ? <DashboardMessageState kind="error" title="Não foi possível carregar os documentos" description="Tente carregar novamente a gestão documental." onRetry={() => void load(filters)} /> : <SectionCard className="document-results-card" title={`${response?.total ?? 0} documento${response?.total === 1 ? "" : "s"}`} subtitle="Validade temporal derivada pelo banco de dados" action={<Badge appearance="tint" color="subtle">10 por página</Badge>}><DocumentGrid records={response?.records ?? []} loading={loading} filtered={hasActiveFilters} page={response?.page ?? filters.page} totalPages={response?.totalPages ?? 1} canWrite={canWrite} canManageFiles={canManageFiles} canInactivate={canInactivate} canDelete={canDelete} onView={(item) => void view(item)} onEdit={openEdit} onManageFiles={(item) => void manageFiles(item)} onInactivate={(document) => setDialog({ kind: "inactivate", document })} onDelete={(document) => setDialog({ kind: "delete", document })} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} onClear={clearFilters} onNew={openNew} /></SectionCard>}</main></div>
    <DocumentDetailsDrawer record={details} open={detailsOpen} canEdit={canWrite} canReadFiles={canReadFiles} canManageFiles={canManageFiles} canRemoveFiles={canRemoveFiles} uploadingFile={fileUploading} remoteCopyingLocationId={remoteCopyingLocationId} onClose={() => setDetailsOpen(false)} onEdit={() => { if (details) openEdit(details.document); }} onFarm={(id) => { setDetailsOpen(false); onNavigate(`/fazendas?open=${id}`); }} onRegistration={(id) => { setDetailsOpen(false); onNavigate(`/matriculas?open=${id}`); }} onUploadFile={() => fileInput.current?.click()} onAddAttachment={() => { setEditingAttachment(undefined); setAttachmentError(undefined); setAttachmentOpen(true); }} onDownloadFile={(_, locationId) => void downloadFile(locationId)} onRequestRemoteCopy={(attachment, sourceLocationId) => void requestRemoteCopy(attachment, sourceLocationId)} onRemoveCloudLocation={(attachment, locationId, version) => setDialog({ kind: "remove-cloud-location", attachment, locationId, version })} onRemoveAttachment={(attachment) => setDialog({ kind: "remove-attachment", attachment })} />
    <DocumentFormDrawer open={formOpen} document={formDocument} attachments={formDocument?.id === details?.document.id ? details?.attachments ?? [] : []} farms={farms} registrations={registrations} types={types} saving={saving} canInactivate={canInactivate} canManageFiles={canManageFiles} serviceError={formError} onClose={() => { if (!saving) setFormOpen(false); }} onSave={(draft, pending) => void saveDocument(draft, pending)} />
    <AttachmentFormDialog open={attachmentOpen} value={editingAttachment} saving={saving} serviceError={attachmentError} onClose={() => { if (!saving) setAttachmentOpen(false); }} onSave={(draft) => void saveAttachment(draft)} />
    <input ref={fileInput} className="visually-hidden" type="file" accept={documentUploadAccept} tabIndex={-1} onChange={(event) => void uploadFile(event)} />
    <Toaster toasterId={toasterId} position="top-end" />{dialogConfig ? <ConfirmDialog open title={dialogConfig.title} message={dialogConfig.message} confirmLabel={dialogConfig.confirmLabel} danger={dialogConfig.danger} onCancel={() => setDialog({ kind: "none" })} onConfirm={() => void confirmAction()} /> : null}
  </div>;
}
