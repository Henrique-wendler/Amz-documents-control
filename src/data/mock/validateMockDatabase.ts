import type { Activity, MockDatabase } from "../../types/domain";

const hasId = (records: Array<{ id: string }>, id: string) => records.some((record) => record.id === id);

export function validateMockDatabase(database: MockDatabase): string[] {
  const errors: string[] = [];
  const collections = Object.entries(database) as Array<[keyof MockDatabase, Array<{ id: string }>]>
  for (const [name, records] of collections) {
    const seen = new Set<string>();
    for (const record of records) {
      if (seen.has(record.id)) errors.push(`${String(name)} contém ID duplicado: ${record.id}`);
      seen.add(record.id);
    }
  }

  database.registrations.forEach((record) => {
    if (!hasId(database.farms, record.farmId)) errors.push(`Registration ${record.id} referencia Farm inexistente: ${record.farmId}`);
  });
  database.ownershipLinks.forEach((link) => {
    if (!hasId(database.owners, link.ownerId)) errors.push(`OwnershipLink ${link.id} referencia Owner inexistente: ${link.ownerId}`);
    if (!hasId(database.registrations, link.registrationId)) errors.push(`OwnershipLink ${link.id} referencia Registration inexistente: ${link.registrationId}`);
  });
  database.operations.forEach((operation) => {
    if (!hasId(database.farms, operation.farmId)) errors.push(`Operation ${operation.id} referencia Farm inexistente: ${operation.farmId}`);
    if (operation.registrationId && !hasId(database.registrations, operation.registrationId)) errors.push(`Operation ${operation.id} referencia Registration inexistente: ${operation.registrationId}`);
  });
  database.guarantees.forEach((guarantee) => {
    if (!hasId(database.operations, guarantee.operationId)) errors.push(`Guarantee ${guarantee.id} referencia Operation inexistente: ${guarantee.operationId}`);
    if (!hasId(database.registrations, guarantee.registrationId)) errors.push(`Guarantee ${guarantee.id} referencia Registration inexistente: ${guarantee.registrationId}`);
  });
  database.guaranteeItems.forEach((item) => {
    if (!hasId(database.guarantees, item.guaranteeId)) errors.push(`GuaranteeItem ${item.id} referencia Guarantee inexistente: ${item.guaranteeId}`);
  });
  database.documents.forEach((document) => {
    if (!hasId(database.farms, document.farmId)) errors.push(`Document ${document.id} referencia Farm inexistente: ${document.farmId}`);
    if (document.registrationId && !hasId(database.registrations, document.registrationId)) errors.push(`Document ${document.id} referencia Registration inexistente: ${document.registrationId}`);
  });
  database.documentAttachments.forEach((attachment) => {
    if (!hasId(database.documents, attachment.documentId)) errors.push(`DocumentAttachment ${attachment.id} referencia Document inexistente: ${attachment.documentId}`);
  });
  database.carRecords.forEach((car) => {
    if (!hasId(database.farms, car.farmId)) errors.push(`CAR ${car.id} referencia Farm inexistente: ${car.farmId}`);
    if (car.registrationId && !hasId(database.registrations, car.registrationId)) errors.push(`CAR ${car.id} referencia Registration inexistente: ${car.registrationId}`);
    if (car.ownerId && !hasId(database.owners, car.ownerId)) errors.push(`CAR ${car.id} referencia Owner inexistente: ${car.ownerId}`);
  });

  const activityTargets: Record<Activity["entityType"], Array<{ id: string }>> = {
    owner: database.owners,
    farm: database.farms,
    registration: database.registrations,
    operation: database.operations,
    guarantee: database.guarantees,
    guaranteeItem: database.guaranteeItems,
    document: database.documents,
    car: database.carRecords,
  };
  database.activities.forEach((activity) => {
    if (!hasId(activityTargets[activity.entityType], activity.entityId)) errors.push(`Activity ${activity.id} referencia entidade inexistente: ${activity.entityType}/${activity.entityId}`);
  });
  return errors;
}

export function reportMockDatabaseIntegrity(database: MockDatabase) {
  const errors = validateMockDatabase(database);
  const isDevelopment = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (isDevelopment && errors.length) console.error("[MockDatabase] Integridade referencial inválida:\n" + errors.join("\n"));
  return errors;
}
