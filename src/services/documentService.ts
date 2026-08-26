import { mockStore } from "../data/mock/mockStore";
import { getAttachmentsByDocument, getDocumentById, getDocumentValidityInfo, MOCK_REFERENCE_DATE } from "../data/mock/selectors";
import type { DocumentAttachment, RuralDocument } from "../types/domain";
import type { AttachmentDraft, DocumentDetailsViewModel, DocumentDraft, DocumentFilters, DocumentListItem, DocumentListResponse, DocumentLoadMode } from "../types/documento";

const clone = <T,>(value: T): T => structuredClone(value);
const delay = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
const normalize = (value?: string) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();

const toListItem = (document: RuralDocument): DocumentListItem => {
  const db = mockStore.getState();
  const farm = db.farms.find((item) => item.id === document.farmId);
  const registration = document.registrationId ? db.registrations.find((item) => item.id === document.registrationId) : undefined;
  const validity = getDocumentValidityInfo(document);
  return { ...document, farmName: farm?.name ?? "Fazenda não encontrada", farmLocation: farm ? `${farm.municipality} / ${farm.state}` : "—", registrationNumber: registration?.number, validityStatus: validity.status, daysUntilExpiration: validity.daysUntilExpiration, attachmentCount: getAttachmentsByDocument(document.id, db).length };
};

const validateDraft = (draft: DocumentDraft, currentId?: string) => {
  const db = mockStore.getState();
  if (!draft.type.trim()) throw new Error("Informe o tipo do documento.");
  if (!draft.farmId || !db.farms.some((farm) => farm.id === draft.farmId)) throw new Error("Selecione a fazenda vinculada.");
  if (draft.registrationId) {
    const registration = db.registrations.find((item) => item.id === draft.registrationId);
    if (!registration || registration.farmId !== draft.farmId) throw new Error("A matrícula selecionada não pertence à fazenda informada.");
  }
  if (draft.licensedArea !== undefined && (!Number.isFinite(draft.licensedArea) || draft.licensedArea < 0)) throw new Error("A área licenciada não pode ser negativa.");
  if (draft.issueDate && draft.expirationDate && draft.expirationDate < draft.issueDate) throw new Error("A data de validade não pode ser anterior à emissão.");
  if (draft.number?.trim() && db.documents.some((item) => item.id !== currentId && normalize(item.type) === normalize(draft.type) && normalize(item.number) === normalize(draft.number))) throw new Error("Já existe um documento deste tipo com o mesmo número.");
};

const validateAttachment = (draft: AttachmentDraft) => {
  if (!draft.fileName.trim()) throw new Error("Informe o nome do arquivo.");
  if (!draft.filePath.trim()) throw new Error("Informe o caminho de rede do arquivo.");
  if (draft.fileSize !== undefined && (!Number.isFinite(draft.fileSize) || draft.fileSize < 0)) throw new Error("O tamanho do arquivo não pode ser negativo.");
};

const buildSummary = (records: DocumentListItem[]) => ({
  total: records.length,
  active: records.filter((item) => item.validityStatus === "active").length,
  expiring: records.filter((item) => item.validityStatus === "expiring").length,
  expired: records.filter((item) => item.validityStatus === "expired").length,
});

const allItems = () => mockStore.getState().documents.map(toListItem);

export const documentService = {
  referenceDate: MOCK_REFERENCE_DATE,
  async list(filters: DocumentFilters, mode: DocumentLoadMode = "success"): Promise<DocumentListResponse> {
    await delay(360);
    if (mode === "error") throw new Error("Não foi possível carregar os documentos.");
    const source = mode === "empty" ? [] : allItems();
    const summary = buildSummary(source);
    const query = normalize(filters.query);
    let filtered = source.filter((item) => {
      const matchesQuery = !query || [item.type, item.number, item.farmName, item.registrationNumber, item.exercise, item.purpose].some((value) => normalize(value).includes(query));
      const matchesType = !filters.type || item.type === filters.type;
      const matchesStatus = filters.status === "all" || item.validityStatus === filters.status;
      const matchesFarm = !filters.farmId || item.farmId === filters.farmId;
      const matchesRegistration = !filters.registrationId || item.registrationId === filters.registrationId;
      const matchesExercise = !filters.exercise || normalize(item.exercise).includes(normalize(filters.exercise));
      const matchesPurpose = !filters.purpose || normalize(item.purpose).includes(normalize(filters.purpose));
      const matchesAttachment = filters.attachmentRelation === "all" || (filters.attachmentRelation === "with" ? item.attachmentCount > 0 : item.attachmentCount === 0);
      const matchesWindow = filters.expirationWindow === "all" || (item.daysUntilExpiration !== undefined && item.daysUntilExpiration >= 0 && item.daysUntilExpiration <= Number(filters.expirationWindow) && item.status !== "inactive");
      return matchesQuery && matchesType && matchesStatus && matchesFarm && matchesRegistration && matchesExercise && matchesPurpose && matchesAttachment && matchesWindow;
    });
    filtered = filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.type.localeCompare(b.type, "pt-BR"));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
    const page = Math.min(filters.page, totalPages);
    const start = (page - 1) * filters.pageSize;
    return clone({ records: filtered.slice(start, start + filters.pageSize), total, page, pageSize: filters.pageSize, totalPages, summary });
  },
  async getDetails(id: string): Promise<DocumentDetailsViewModel> {
    await delay(150);
    const db = mockStore.getState();
    const document = getDocumentById(id, db);
    if (!document) throw new Error("Documento não encontrado.");
    return clone({ document: toListItem(document), farm: db.farms.find((item) => item.id === document.farmId), registration: document.registrationId ? db.registrations.find((item) => item.id === document.registrationId) : undefined, attachments: getAttachmentsByDocument(id, db) });
  },
  async create(draft: DocumentDraft) { validateDraft(draft); await delay(180); return clone(mockStore.createDocument({ ...draft, type: draft.type.trim(), number: draft.number?.trim(), status: draft.status })); },
  async update(id: string, draft: DocumentDraft) { validateDraft(draft, id); await delay(180); return clone(mockStore.updateDocument(id, { ...draft, type: draft.type.trim(), number: draft.number?.trim() })); },
  async inactivate(id: string) { await delay(120); return clone(mockStore.updateDocument(id, { status: "inactive" })); },
  async delete(id: string) { await delay(120); mockStore.deleteDocument(id); },
  async addAttachment(documentId: string, draft: AttachmentDraft) { validateAttachment(draft); await delay(120); return clone(mockStore.addDocumentAttachment(documentId, { ...draft, fileName: draft.fileName.trim(), filePath: draft.filePath.trim() })); },
  async updateAttachment(id: string, draft: AttachmentDraft) { validateAttachment(draft); await delay(120); return clone(mockStore.updateDocumentAttachment(id, { ...draft, fileName: draft.fileName.trim(), filePath: draft.filePath.trim() })); },
  async removeAttachment(id: string) { await delay(100); mockStore.removeDocumentAttachment(id); },
  getFarmOptions() { return mockStore.getState().farms.filter((farm) => farm.status === "active").map((farm) => ({ id: farm.id, label: farm.name })); },
  getRegistrationOptions(farmId = "") { return mockStore.getState().registrations.filter((registration) => registration.status === "active" && (!farmId || registration.farmId === farmId)).map((registration) => ({ id: registration.id, label: `Matrícula ${registration.number}`, farmId: registration.farmId })); },
  getTypeOptions() { return Array.from(new Set(mockStore.getState().documents.map((document) => document.type))).sort((a, b) => a.localeCompare(b, "pt-BR")); },
  validateIntegrity() { return mockStore.validate(); },
  getAttachment(id: string): DocumentAttachment | undefined { const found = mockStore.getState().documentAttachments.find((item) => item.id === id); return found ? clone(found) : undefined; },
};
