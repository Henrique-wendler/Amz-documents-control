import type { DocumentValidityStatus, MockDatabase, RuralDocument } from "../../types/domain";
import { mockStore } from "./mockStore";

const database = (source?: MockDatabase) => source ?? mockStore.getState();

export const getOwnerById = (id: string, source?: MockDatabase) => database(source).owners.find((owner) => owner.id === id);
export const getFarmById = (id: string, source?: MockDatabase) => database(source).farms.find((farm) => farm.id === id);
export const getRegistrationById = (id: string, source?: MockDatabase) => database(source).registrations.find((registration) => registration.id === id);
export const getOperationById = (id: string, source?: MockDatabase) => database(source).operations.find((operation) => operation.id === id);
export const getGuaranteeById = (id: string, source?: MockDatabase) => database(source).guarantees.find((guarantee) => guarantee.id === id);
export const getDocumentById = (id: string, source?: MockDatabase) => database(source).documents.find((document) => document.id === id);
export const getAttachmentsByDocument = (documentId: string, source?: MockDatabase) => database(source).documentAttachments.filter((attachment) => attachment.documentId === documentId);
export const getCarById = (id: string, source?: MockDatabase) => database(source).carRecords.find((car) => car.id === id);

export const getRegistrationsByFarm = (farmId: string, source?: MockDatabase) => database(source).registrations.filter((registration) => registration.farmId === farmId);
export const getFarmByRegistration = (registrationId: string, source?: MockDatabase) => {
  const db = database(source);
  const registration = getRegistrationById(registrationId, db);
  return registration ? getFarmById(registration.farmId, db) : undefined;
};

export const getOwnershipLinksByRegistration = (registrationId: string, source?: MockDatabase) =>
  database(source).ownershipLinks.filter((link) => link.registrationId === registrationId);

export const getOwnersByRegistration = (registrationId: string, source?: MockDatabase) => {
  const db = database(source);
  const ownerIds = new Set(getOwnershipLinksByRegistration(registrationId, db).filter((link) => link.status === "active").map((link) => link.ownerId));
  return db.owners.filter((owner) => ownerIds.has(owner.id));
};

export const getActiveOwnershipPercentage = (registrationId: string, source?: MockDatabase, excludeLinkId?: string) =>
  getOwnershipLinksByRegistration(registrationId, source)
    .filter((link) => link.status === "active" && link.id !== excludeLinkId && link.percentage !== undefined)
    .reduce((sum, link) => sum + (link.percentage ?? 0), 0);

export const getRegistrationRelationCounts = (registrationId: string, source?: MockDatabase) => {
  const db = database(source);
  return {
    ownerCount: getOwnersByRegistration(registrationId, db).length,
    ownershipLinkCount: getOwnershipLinksByRegistration(registrationId, db).length,
    operationCount: getOperationsByRegistration(registrationId, db).length,
    guaranteeCount: getGuaranteesByRegistration(registrationId, db).length,
    documentCount: getDocumentsByRegistration(registrationId, db).length,
    activePercentage: getActiveOwnershipPercentage(registrationId, db),
  };
};

export const getRegistrationsByOwner = (ownerId: string, source?: MockDatabase) => {
  const db = database(source);
  const registrationIds = new Set(db.ownershipLinks.filter((link) => link.ownerId === ownerId && link.status === "active").map((link) => link.registrationId));
  return db.registrations.filter((registration) => registrationIds.has(registration.id));
};

export const getFarmsByOwner = (ownerId: string, source?: MockDatabase) => {
  const db = database(source);
  const farmIds = new Set(getRegistrationsByOwner(ownerId, db).map((registration) => registration.farmId));
  return db.farms.filter((farm) => farmIds.has(farm.id));
};

export const getOperationsByFarm = (farmId: string, source?: MockDatabase) => database(source).operations.filter((operation) => operation.farmId === farmId);
export const getOperationsByRegistration = (registrationId: string, source?: MockDatabase) => database(source).operations.filter((operation) => operation.registrationId === registrationId);
export const getGuaranteesByOperation = (operationId: string, source?: MockDatabase) => database(source).guarantees.filter((guarantee) => guarantee.operationId === operationId);
export const getGuaranteesByRegistration = (registrationId: string, source?: MockDatabase) => database(source).guarantees.filter((guarantee) => guarantee.registrationId === registrationId);
export const getGuaranteeItems = (guaranteeId: string, source?: MockDatabase) => database(source).guaranteeItems.filter((item) => item.guaranteeId === guaranteeId);
export const getDocumentsByFarm = (farmId: string, source?: MockDatabase) => database(source).documents.filter((document) => document.farmId === farmId);
export const getDocumentsByRegistration = (registrationId: string, source?: MockDatabase) => database(source).documents.filter((document) => document.registrationId === registrationId);
export const getCarByFarm = (farmId: string, source?: MockDatabase) => database(source).carRecords.find((car) => car.farmId === farmId);
export const getCarsByFarm = (farmId: string, source?: MockDatabase) => database(source).carRecords.filter((car) => car.farmId === farmId);

export const getOwnersByFarm = (farmId: string, source?: MockDatabase) => {
  const db = database(source);
  const registrationIds = new Set(getRegistrationsByFarm(farmId, db).map((registration) => registration.id));
  const ownerIds = new Set(db.ownershipLinks.filter((link) => link.status === "active" && registrationIds.has(link.registrationId)).map((link) => link.ownerId));
  return db.owners.filter((owner) => ownerIds.has(owner.id));
};

export const getActiveOperationsByFarm = (farmId: string, source?: MockDatabase) =>
  getOperationsByFarm(farmId, source).filter((operation) => operation.status === "active");

export const getFarmRelationCounts = (farmId: string, source?: MockDatabase) => {
  const db = database(source);
  return {
    registrationCount: getRegistrationsByFarm(farmId, db).length,
    ownerCount: getOwnersByFarm(farmId, db).length,
    activeOperationCount: getActiveOperationsByFarm(farmId, db).length,
    operationCount: getOperationsByFarm(farmId, db).length,
    documentCount: getDocumentsByFarm(farmId, db).length,
    carCount: getCarsByFarm(farmId, db).length,
  };
};

export const getOperationsByOwner = (ownerId: string, source?: MockDatabase) => {
  const db = database(source);
  const farmIds = new Set(getFarmsByOwner(ownerId, db).map((farm) => farm.id));
  return db.operations.filter((operation) => farmIds.has(operation.farmId));
};

export const getOwnerRelationCounts = (ownerId: string, source?: MockDatabase) => {
  const db = database(source);
  return {
    farmCount: getFarmsByOwner(ownerId, db).length,
    registrationCount: getRegistrationsByOwner(ownerId, db).length,
    operationCount: getOperationsByOwner(ownerId, db).length,
  };
};

export const MOCK_REFERENCE_DATE = "2026-08-21";

export const getDocumentValidityInfo = (document: RuralDocument, referenceDate = MOCK_REFERENCE_DATE): { status: DocumentValidityStatus; daysUntilExpiration?: number } => {
  if (document.status === "inactive") return { status: "inactive" };
  if (!document.expirationDate) return { status: "active" };
  const reference = new Date(`${referenceDate}T00:00:00Z`).getTime();
  const expiration = new Date(`${document.expirationDate}T00:00:00Z`).getTime();
  const daysUntilExpiration = Math.round((expiration - reference) / 86400000);
  if (daysUntilExpiration < 0) return { status: "expired", daysUntilExpiration };
  if (daysUntilExpiration <= 30) return { status: "expiring", daysUntilExpiration };
  return { status: "active", daysUntilExpiration };
};

export const getDocumentValidityStatus = (document: RuralDocument, referenceDate = MOCK_REFERENCE_DATE) => getDocumentValidityInfo(document, referenceDate).status;

export const getExpiringDocuments = (referenceDate = MOCK_REFERENCE_DATE, days = 30, source?: MockDatabase) => {
  const reference = new Date(`${referenceDate}T00:00:00Z`).getTime();
  const maximum = reference + days * 86400000;
  return database(source).documents.filter((document) => {
    if (!document.expirationDate || document.status === "inactive") return false;
    const expiration = new Date(`${document.expirationDate}T00:00:00Z`).getTime();
    return expiration >= reference && expiration <= maximum;
  });
};
