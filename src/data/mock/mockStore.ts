import type { Activity, DocumentAttachment, Farm, Guarantee, GuaranteeItem, MockDatabase, Operation, Owner, OwnershipLink, Registration, RuralDocument } from "../../types/domain";
import { createMockDatabase } from "./mockDatabase";
import { reportMockDatabaseIntegrity, validateMockDatabase } from "./validateMockDatabase";

type Listener = () => void;

const datePtBr = () => new Intl.DateTimeFormat("pt-BR").format(new Date());
const dateIso = () => new Date().toISOString().slice(0, 10);
const dateTimeIso = () => new Date().toISOString().slice(0, 19);

const nextId = (prefix: string, records: Array<{ id: string }>) => {
  const next = Math.max(...records.map((record) => Number(record.id.replace(/\D/g, ""))), 0) + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
};

class MockDatabaseStore {
  private database: MockDatabase = createMockDatabase();
  private listeners = new Set<Listener>();

  constructor() {
    reportMockDatabaseIntegrity(this.database);
  }

  getState(): MockDatabase {
    return this.database;
  }

  getSnapshot(): MockDatabase {
    return structuredClone(this.database);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset() {
    this.database = createMockDatabase();
    this.commit();
  }

  createOwner(draft: Omit<Owner, "id" | "createdAt" | "updatedAt">): Owner {
    const date = datePtBr();
    const owner: Owner = { ...draft, id: nextId("OWN", this.database.owners), createdAt: date, updatedAt: date };
    this.database.owners.push(owner);
    this.addActivity("owner", owner.id, "Proprietário cadastrado");
    this.commit();
    return structuredClone(owner);
  }

  updateOwner(id: string, changes: Partial<Omit<Owner, "id" | "createdAt">>): Owner {
    const index = this.database.owners.findIndex((owner) => owner.id === id);
    if (index < 0) throw new Error("Proprietário não encontrado.");
    const owner = { ...this.database.owners[index], ...changes, updatedAt: datePtBr() };
    this.database.owners[index] = owner;
    this.addActivity("owner", id, "Proprietário atualizado");
    this.commit();
    return structuredClone(owner);
  }

  deleteOwner(id: string) {
    this.database.owners = this.database.owners.filter((owner) => owner.id !== id);
    this.database.activities = this.database.activities.filter((activity) => !(activity.entityType === "owner" && activity.entityId === id));
    this.commit();
  }

  createFarm(draft: Omit<Farm, "id" | "createdAt" | "updatedAt">): Farm {
    const date = datePtBr();
    const farm: Farm = { ...draft, id: nextId("FARM", this.database.farms), createdAt: date, updatedAt: date };
    this.database.farms.push(farm);
    this.addActivity("farm", farm.id, "Fazenda cadastrada");
    this.commit();
    return structuredClone(farm);
  }

  updateFarm(id: string, changes: Partial<Omit<Farm, "id" | "createdAt">>): Farm {
    const index = this.database.farms.findIndex((farm) => farm.id === id);
    if (index < 0) throw new Error("Fazenda não encontrada.");
    const farm = { ...this.database.farms[index], ...changes, updatedAt: datePtBr() };
    this.database.farms[index] = farm;
    this.addActivity("farm", id, changes.status === "inactive" ? "Fazenda inativada" : "Fazenda atualizada");
    this.commit();
    return structuredClone(farm);
  }

  deleteFarm(id: string) {
    this.database.farms = this.database.farms.filter((farm) => farm.id !== id);
    this.database.activities = this.database.activities.filter((activity) => !(activity.entityType === "farm" && activity.entityId === id));
    this.commit();
  }

  validate() {
    return validateMockDatabase(this.database);
  }

  createRegistration(draft: Omit<Registration, "id" | "createdAt" | "updatedAt">): Registration {
    const date = datePtBr();
    const registration: Registration = { ...draft, id: nextId("REG", this.database.registrations), createdAt: date, updatedAt: date };
    this.database.registrations.push(registration);
    this.addActivity("registration", registration.id, "Matrícula cadastrada", "US");
    this.commit();
    return structuredClone(registration);
  }

  updateRegistration(id: string, changes: Partial<Omit<Registration, "id" | "createdAt">>): Registration {
    const index = this.database.registrations.findIndex((registration) => registration.id === id);
    if (index < 0) throw new Error("Matrícula não encontrada.");
    const registration = { ...this.database.registrations[index], ...changes, updatedAt: datePtBr() };
    this.database.registrations[index] = registration;
    this.addActivity("registration", id, changes.status === "inactive" ? "Matrícula inativada" : "Matrícula atualizada", "US");
    this.commit();
    return structuredClone(registration);
  }

  deleteRegistration(id: string) {
    this.database.registrations = this.database.registrations.filter((registration) => registration.id !== id);
    this.database.activities = this.database.activities.filter((activity) => !(activity.entityType === "registration" && activity.entityId === id));
    this.commit();
  }

  createOwnershipLink(draft: Omit<OwnershipLink, "id">): OwnershipLink {
    const link: OwnershipLink = { ...draft, id: nextId("LINK", this.database.ownershipLinks) };
    this.database.ownershipLinks.push(link);
    this.addActivity("registration", link.registrationId, "Proprietário vinculado", "US");
    this.commit();
    return structuredClone(link);
  }

  updateOwnershipLink(id: string, changes: Partial<Omit<OwnershipLink, "id" | "registrationId">>): OwnershipLink {
    const index = this.database.ownershipLinks.findIndex((link) => link.id === id);
    if (index < 0) throw new Error("Vínculo não encontrado.");
    const link = { ...this.database.ownershipLinks[index], ...changes };
    this.database.ownershipLinks[index] = link;
    this.addActivity("registration", link.registrationId, "Vínculo de propriedade atualizado", "US");
    this.commit();
    return structuredClone(link);
  }

  closeOwnershipLink(id: string): OwnershipLink {
    const index = this.database.ownershipLinks.findIndex((link) => link.id === id);
    if (index < 0) throw new Error("Vínculo não encontrado.");
    const link = { ...this.database.ownershipLinks[index], status: "inactive" as const, endDate: datePtBr() };
    this.database.ownershipLinks[index] = link;
    this.addActivity("registration", link.registrationId, "Vínculo de propriedade encerrado", "US");
    this.commit();
    return structuredClone(link);
  }

  deleteOwnershipLink(id: string) {
    this.database.ownershipLinks = this.database.ownershipLinks.filter((link) => link.id !== id);
    this.commit();
  }

  saveOperation(value: Operation): Operation {
    const existing = this.database.operations.findIndex((operation) => operation.id === value.id);
    const operation = existing >= 0
      ? { ...value, updatedAt: dateIso() }
      : { ...value, id: value.id || nextId("OP", this.database.operations), createdAt: dateIso(), updatedAt: dateIso() };
    if (existing >= 0) this.database.operations[existing] = operation;
    else this.database.operations.push(operation);
    this.addActivity("operation", operation.id, existing >= 0 ? "Operação atualizada" : "Operação cadastrada");
    this.commit();
    return structuredClone(operation);
  }

  deleteOperation(id: string) {
    const guaranteeIds = new Set(this.database.guarantees.filter((guarantee) => guarantee.operationId === id).map((guarantee) => guarantee.id));
    const itemIds = new Set(this.database.guaranteeItems.filter((item) => guaranteeIds.has(item.guaranteeId)).map((item) => item.id));
    this.database.guaranteeItems = this.database.guaranteeItems.filter((item) => !itemIds.has(item.id));
    this.database.guarantees = this.database.guarantees.filter((guarantee) => guarantee.operationId !== id);
    this.database.operations = this.database.operations.filter((operation) => operation.id !== id);
    this.database.activities = this.database.activities.filter((activity) =>
      !(activity.entityType === "operation" && activity.entityId === id)
      && !(activity.entityType === "guarantee" && guaranteeIds.has(activity.entityId))
      && !(activity.entityType === "guaranteeItem" && itemIds.has(activity.entityId))
    );
    this.commit();
  }

  saveGuarantee(value: Guarantee): Guarantee {
    const existing = this.database.guarantees.findIndex((guarantee) => guarantee.id === value.id);
    const guarantee = existing >= 0
      ? { ...value, updatedAt: dateIso() }
      : { ...value, id: value.id || nextId("GAR", this.database.guarantees), createdAt: dateIso(), updatedAt: dateIso() };
    if (existing >= 0) this.database.guarantees[existing] = guarantee;
    else this.database.guarantees.push(guarantee);
    this.addActivity("guarantee", guarantee.id, existing >= 0 ? "Garantia atualizada" : "Garantia cadastrada");
    this.commit();
    return structuredClone(guarantee);
  }

  deleteGuarantee(id: string) {
    const itemIds = new Set(this.database.guaranteeItems.filter((item) => item.guaranteeId === id).map((item) => item.id));
    this.database.guaranteeItems = this.database.guaranteeItems.filter((item) => !itemIds.has(item.id));
    this.database.guarantees = this.database.guarantees.filter((guarantee) => guarantee.id !== id);
    this.database.activities = this.database.activities.filter((activity) =>
      !(activity.entityType === "guarantee" && activity.entityId === id)
      && !(activity.entityType === "guaranteeItem" && itemIds.has(activity.entityId))
    );
    this.commit();
  }

  saveGuaranteeItem(value: GuaranteeItem): GuaranteeItem {
    const existing = this.database.guaranteeItems.findIndex((item) => item.id === value.id);
    const item = existing >= 0
      ? { ...value, updatedAt: dateIso() }
      : { ...value, id: value.id || nextId("GITEM", this.database.guaranteeItems), createdAt: dateIso(), updatedAt: dateIso() };
    if (existing >= 0) this.database.guaranteeItems[existing] = item;
    else this.database.guaranteeItems.push(item);
    this.addActivity("guaranteeItem", item.id, existing >= 0 ? "Item de garantia atualizado" : "Item de garantia cadastrado");
    this.commit();
    return structuredClone(item);
  }

  deleteGuaranteeItem(id: string) {
    this.database.guaranteeItems = this.database.guaranteeItems.filter((item) => item.id !== id);
    this.database.activities = this.database.activities.filter((activity) => !(activity.entityType === "guaranteeItem" && activity.entityId === id));
    this.commit();
  }

  createDocument(draft: Omit<RuralDocument, "id" | "createdAt" | "updatedAt">): RuralDocument {
    const date = dateIso();
    const document: RuralDocument = { ...draft, id: nextId("DOC", this.database.documents), createdAt: date, updatedAt: date };
    this.database.documents.push(document);
    this.addActivity("document", document.id, "Documento cadastrado", "US");
    this.commit();
    return structuredClone(document);
  }

  updateDocument(id: string, changes: Partial<Omit<RuralDocument, "id" | "createdAt">>): RuralDocument {
    const index = this.database.documents.findIndex((document) => document.id === id);
    if (index < 0) throw new Error("Documento não encontrado.");
    const document = { ...this.database.documents[index], ...changes, updatedAt: dateIso() };
    this.database.documents[index] = document;
    this.addActivity("document", id, changes.status === "inactive" ? "Documento inativado" : "Documento atualizado", "US");
    this.commit();
    return structuredClone(document);
  }

  deleteDocument(id: string) {
    this.database.documents = this.database.documents.filter((document) => document.id !== id);
    this.database.documentAttachments = this.database.documentAttachments.filter((attachment) => attachment.documentId !== id);
    this.database.activities = this.database.activities.filter((activity) => !(activity.entityType === "document" && activity.entityId === id));
    this.commit();
  }

  addDocumentAttachment(documentId: string, draft: Omit<DocumentAttachment, "id" | "documentId" | "createdAt" | "updatedAt">): DocumentAttachment {
    if (!this.database.documents.some((document) => document.id === documentId)) throw new Error("Documento não encontrado.");
    const date = dateIso();
    const attachment: DocumentAttachment = { ...draft, id: nextId("ATT", this.database.documentAttachments), documentId, createdAt: date, updatedAt: date };
    this.database.documentAttachments.push(attachment);
    this.addActivity("document", documentId, "Referência de arquivo adicionada", "US");
    this.commit();
    return structuredClone(attachment);
  }

  updateDocumentAttachment(id: string, changes: Partial<Omit<DocumentAttachment, "id" | "documentId" | "createdAt">>): DocumentAttachment {
    const index = this.database.documentAttachments.findIndex((attachment) => attachment.id === id);
    if (index < 0) throw new Error("Referência de arquivo não encontrada.");
    const attachment = { ...this.database.documentAttachments[index], ...changes, updatedAt: dateIso() };
    this.database.documentAttachments[index] = attachment;
    this.addActivity("document", attachment.documentId, "Referência de arquivo atualizada", "US");
    this.commit();
    return structuredClone(attachment);
  }

  removeDocumentAttachment(id: string) {
    const attachment = this.database.documentAttachments.find((item) => item.id === id);
    if (!attachment) throw new Error("Referência de arquivo não encontrada.");
    this.database.documentAttachments = this.database.documentAttachments.filter((item) => item.id !== id);
    this.addActivity("document", attachment.documentId, "Referência de arquivo removida", "US");
    this.commit();
  }

  private addActivity(entityType: Activity["entityType"], entityId: string, action: string, userName = "Usuário") {
    this.database.activities.unshift({ id: nextId("ACT", this.database.activities), entityType, entityId, action, userName, createdAt: dateTimeIso() });
  }

  private commit() {
    reportMockDatabaseIntegrity(this.database);
    this.listeners.forEach((listener) => listener());
  }
}

export const mockStore = new MockDatabaseStore();
export const resetMockDatabase = () => mockStore.reset();
