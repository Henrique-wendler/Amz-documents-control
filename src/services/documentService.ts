import { supabaseDocumentAttachmentRepository } from "../repositories/supabaseDocumentAttachmentRepository";
import { supabaseDocumentRepository } from "../repositories/supabaseDocumentRepository";
import { supabaseDocumentTypeRepository } from "../repositories/supabaseDocumentTypeRepository";
import { supabaseFarmRepository } from "../repositories/supabaseFarmRepository";
import { supabaseRegistrationRepository } from "../repositories/supabaseRegistrationRepository";
import type { PersistedDocument } from "../repositories/documentRepository";
import type { PersistedDocumentAttachment } from "../repositories/documentAttachmentRepository";
import type { AttachmentDraft, DocumentDetailsViewModel, DocumentDraft, DocumentFilters, DocumentListItem, DocumentListResponse, DocumentLoadMode } from "../types/documento";

const normalize = (value?: string) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
const daysUntil = (expirationDate?: string) => expirationDate === undefined ? undefined : Math.round((new Date(`${expirationDate}T00:00:00Z`).getTime() - new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime()) / 86400000);
const toInput = (draft: DocumentDraft) => ({ farmId: draft.farmId, registrationId: draft.registrationId, documentTypeId: draft.documentTypeId, documentNumber: draft.number?.trim() || undefined, exerciseYear: draft.exercise ? Number(draft.exercise) : undefined, issueDate: draft.issueDate, expirationDate: draft.expirationDate, purpose: draft.purpose?.trim() || undefined, licensedArea: draft.licensedArea, sigamStatus: draft.sigamStatus?.trim() || undefined, status: draft.status, notes: draft.notes?.trim() || undefined });
const attachmentInput = (draft: AttachmentDraft) => ({ fileName: draft.fileName.trim(), storageType: draft.storageType, filePath: draft.filePath.trim(), mimeType: draft.fileType?.trim() || undefined, fileSize: draft.fileSize });
const toListItem = (document: PersistedDocument, farmName: string, farmLocation: string, registrationNumber: string | undefined, attachmentCount: number): DocumentListItem => ({ ...document, farmName, farmLocation, registrationNumber, daysUntilExpiration: daysUntil(document.expirationDate), attachmentCount });

const buildItems = async (documents: PersistedDocument[]) => {
  const [farms, registrations, attachments] = await Promise.all([supabaseFarmRepository.getByIds([...new Set(documents.map((item) => item.farmId))]), supabaseRegistrationRepository.getByIds([...new Set(documents.flatMap((item) => item.registrationId ? [item.registrationId] : []))]), supabaseDocumentAttachmentRepository.list()]);
  const farmById = new Map(farms.map((farm) => [farm.id, farm]));
  const registrationById = new Map(registrations.map((registration) => [registration.id, registration]));
  const counts = new Map<string, number>(); attachments.forEach((attachment) => counts.set(attachment.documentId, (counts.get(attachment.documentId) ?? 0) + 1));
  return documents.map((document) => { const farm = farmById.get(document.farmId); return toListItem(document, farm?.name ?? "Fazenda não encontrada", farm ? `${farm.municipality} / ${farm.state}` : "—", document.registrationId ? registrationById.get(document.registrationId)?.number : undefined, counts.get(document.id) ?? 0); });
};
const validateDraft = async (draft: DocumentDraft) => {
  if (!draft.documentTypeId) throw new Error("Selecione o tipo do documento.");
  const [farm, type] = await Promise.all([supabaseFarmRepository.getById(draft.farmId), supabaseDocumentTypeRepository.getById(draft.documentTypeId)]);
  if (!farm) throw new Error("Selecione a Fazenda vinculada.");
  if (!type) throw new Error("Selecione um tipo documental válido.");
  if (draft.registrationId) { const registration = await supabaseRegistrationRepository.getById(draft.registrationId); if (!registration || registration.farmId !== draft.farmId) throw new Error("A Matrícula selecionada não pertence à Fazenda informada."); }
  if (draft.exercise && (!/^\d{4}$/.test(draft.exercise) || Number(draft.exercise) < 1900 || Number(draft.exercise) > 2200)) throw new Error("Informe um exercício válido.");
  if (draft.licensedArea !== undefined && (!Number.isFinite(draft.licensedArea) || draft.licensedArea < 0)) throw new Error("A área licenciada não pode ser negativa.");
  if (draft.issueDate && draft.expirationDate && draft.expirationDate < draft.issueDate) throw new Error("A data de validade não pode ser anterior à emissão.");
};
const buildSummary = (records: DocumentListItem[]) => ({ total: records.length, active: records.filter((item) => item.validityStatus === "active").length, expiring: records.filter((item) => item.validityStatus === "expiring").length, expired: records.filter((item) => item.validityStatus === "expired").length });

export const documentService = {
  async list(filters: DocumentFilters, mode: DocumentLoadMode = "success"): Promise<DocumentListResponse> {
    if (mode === "error") throw new Error("Não foi possível carregar os documentos.");
    const source = mode === "empty" ? [] : await buildItems(await supabaseDocumentRepository.list());
    const query = normalize(filters.query);
    const filtered = source.filter((item) => (!query || [item.type, item.number, item.farmName, item.registrationNumber, item.exercise, item.purpose].some((value) => normalize(value).includes(query))) && (!filters.type || item.type === filters.type) && (filters.status === "all" || item.validityStatus === filters.status) && (!filters.farmId || item.farmId === filters.farmId) && (!filters.registrationId || item.registrationId === filters.registrationId) && (!filters.exercise || normalize(item.exercise).includes(normalize(filters.exercise))) && (!filters.purpose || normalize(item.purpose).includes(normalize(filters.purpose))) && (filters.attachmentRelation === "all" || (filters.attachmentRelation === "with" ? item.attachmentCount > 0 : item.attachmentCount === 0)) && (filters.expirationWindow === "all" || (item.daysUntilExpiration !== undefined && item.daysUntilExpiration >= 0 && item.daysUntilExpiration <= Number(filters.expirationWindow) && item.status !== "inactive"))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.type.localeCompare(b.type, "pt-BR"));
    const totalPages = Math.max(1, Math.ceil(filtered.length / filters.pageSize)); const page = Math.min(filters.page, totalPages); const start = (page - 1) * filters.pageSize;
    return { records: filtered.slice(start, start + filters.pageSize), total: filtered.length, page, pageSize: filters.pageSize, totalPages, summary: buildSummary(source) };
  },
  async getDetails(id: string): Promise<DocumentDetailsViewModel> {
    const document = await supabaseDocumentRepository.getById(id); if (!document) throw new Error("Documento não encontrado.");
    const [farm, registration, attachments] = await Promise.all([supabaseFarmRepository.getById(document.farmId), document.registrationId ? supabaseRegistrationRepository.getById(document.registrationId) : Promise.resolve(undefined), supabaseDocumentAttachmentRepository.listByDocument(id)]);
    return { document: toListItem(document, farm?.name ?? "Fazenda não encontrada", farm ? `${farm.municipality} / ${farm.state}` : "—", registration?.number, attachments.length), farm, registration, attachments };
  },
  async create(draft: DocumentDraft) { await validateDraft(draft); return supabaseDocumentRepository.create(toInput(draft)); },
  async update(id: string, expectedVersion: number, draft: DocumentDraft) { await validateDraft(draft); return supabaseDocumentRepository.update(id, expectedVersion, toInput(draft)); },
  async inactivate(id: string, expectedVersion: number) { return supabaseDocumentRepository.inactivate(id, expectedVersion); },
  async delete(id: string, expectedVersion: number) { if ((await supabaseDocumentAttachmentRepository.listByDocument(id)).length) throw new Error("Remova as referências de arquivo antes de excluir o documento."); await supabaseDocumentRepository.softDelete(id, expectedVersion); },
  async addAttachment(documentId: string, draft: AttachmentDraft) { return supabaseDocumentAttachmentRepository.create(documentId, attachmentInput(draft)); },
  async updateAttachment(id: string, expectedVersion: number, draft: AttachmentDraft) { return supabaseDocumentAttachmentRepository.update(id, expectedVersion, attachmentInput(draft)); },
  async removeAttachment(id: string, expectedVersion: number) { return supabaseDocumentAttachmentRepository.softDelete(id, expectedVersion); },
  async logAttachmentAccess(id: string, action: "view" | "download" | "copy_reference") { return supabaseDocumentAttachmentRepository.logAccess(id, action); },
  async getFarmOptions() { return (await supabaseFarmRepository.list()).filter((farm) => farm.status === "active").map((farm) => ({ id: farm.id, label: farm.name })); },
  async getRegistrationOptions(farmId = "") { return (await supabaseRegistrationRepository.list()).filter((registration) => registration.status === "active" && (!farmId || registration.farmId === farmId)).map((registration) => ({ id: registration.id, label: `Matrícula ${registration.number}`, farmId: registration.farmId })); },
  async getTypeOptions() { return (await supabaseDocumentTypeRepository.listActive()).map((type) => ({ id: type.id, label: type.name, requiresExpiration: type.requiresExpiration })); },
  async getAttachment(id: string): Promise<PersistedDocumentAttachment | undefined> { return supabaseDocumentAttachmentRepository.getById(id); },
};
