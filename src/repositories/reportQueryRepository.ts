import type { PersistedCarRecord } from "./carRepository";
import type { PersistedDocument } from "./documentRepository";
import type { PersistedDocumentType } from "./documentTypeRepository";
import type { PersistedFarm } from "./farmRepository";
import type { PersistedOwner } from "./ownerRepository";
import type { PersistedOwnershipLink } from "./ownershipRepository";
import type { PersistedRegistration } from "./registrationRepository";
import type { FinancialInstitutionOption, GuaranteeRecord, GuaranteeTypeOption, OperationRecord } from "../types/operacao";
import type { ReportType } from "../types/report";
import { supabaseCarRepository } from "./supabaseCarRepository";
import { supabaseDocumentRepository } from "./supabaseDocumentRepository";
import { supabaseDocumentTypeRepository } from "./supabaseDocumentTypeRepository";
import { supabaseFarmRepository } from "./supabaseFarmRepository";
import { supabaseGuaranteeRepository } from "./supabaseGuaranteeRepository";
import { supabaseOperationRepository } from "./supabaseOperationRepository";
import { supabaseOwnerRepository } from "./supabaseOwnerRepository";
import { supabaseOwnershipRepository } from "./supabaseOwnershipRepository";
import { supabaseRegistrationRepository } from "./supabaseRegistrationRepository";
import { supabase } from "../lib/supabase";

export interface ReportSnapshot {
  farms: PersistedFarm[];
  owners: PersistedOwner[];
  registrations: PersistedRegistration[];
  ownershipLinks: PersistedOwnershipLink[];
  operations: OperationRecord[];
  guarantees: GuaranteeRecord[];
  institutions: FinancialInstitutionOption[];
  guaranteeTypes: GuaranteeTypeOption[];
  documents: PersistedDocument[];
  documentTypes: PersistedDocumentType[];
  cars: PersistedCarRecord[];
}

const emptySnapshot = (): ReportSnapshot => ({
  farms: [], owners: [], registrations: [], ownershipLinks: [], operations: [], guarantees: [], institutions: [],
  guaranteeTypes: [], documents: [], documentTypes: [], cars: [],
});

// A report preview must never present page-limited data as organization totals.
const verifyCompleteSnapshot = async (type: ReportType, snapshot: ReportSnapshot) => {
  const checks: Array<{ table: string; loaded: number; activeOnly?: boolean }> = [
    { table: "farms", loaded: snapshot.farms.length },
    { table: "registrations", loaded: snapshot.registrations.length },
  ];
  if (type === "owners" || type === "registrations") checks.push(
    { table: "owners", loaded: snapshot.owners.length },
    { table: "ownership_links", loaded: snapshot.ownershipLinks.length },
  );
  if (type === "operations" || type === "guarantees") checks.push(
    { table: "operations", loaded: snapshot.operations.length },
    { table: "financial_institutions", loaded: snapshot.institutions.length },
  );
  if (type === "guarantees") checks.push(
    { table: "guarantees", loaded: snapshot.guarantees.length },
    { table: "guarantee_types", loaded: snapshot.guaranteeTypes.length },
  );
  if (type === "documents") checks.push(
    { table: "rural_documents", loaded: snapshot.documents.length },
    { table: "document_types", loaded: snapshot.documentTypes.length, activeOnly: true },
  );
  if (type === "car") checks.push({ table: "car_records", loaded: snapshot.cars.length });
  await Promise.all(checks.map(async ({ table, loaded, activeOnly }) => {
    let query = supabase.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null);
    if (activeOnly) query = query.eq("status", "active");
    const { count, error } = await query;
    if (error || count === null) throw new Error("Não foi possível confirmar o total de registros da pré-visualização.");
    if (count !== loaded) throw new Error("A pré-visualização excede o limite de registros carregados. Refine a consulta ou use a exportação completa.");
  }));
};

export const reportQueryRepository = {
  async load(type: ReportType, includeFinancial: boolean): Promise<ReportSnapshot> {
    const snapshot = emptySnapshot();
    if (type === "farms") {
      [snapshot.farms, snapshot.registrations] = await Promise.all([
        supabaseFarmRepository.list(), supabaseRegistrationRepository.list(),
      ]);
    } else if (type === "owners" || type === "registrations") {
      [snapshot.farms, snapshot.owners, snapshot.registrations, snapshot.ownershipLinks] = await Promise.all([
        supabaseFarmRepository.list(), supabaseOwnerRepository.listAll(), supabaseRegistrationRepository.list(), supabaseOwnershipRepository.list(),
      ]);
    } else if (type === "operations") {
      [snapshot.farms, snapshot.registrations, snapshot.operations, snapshot.institutions] = await Promise.all([
        supabaseFarmRepository.list(), supabaseRegistrationRepository.list(), supabaseOperationRepository.list(includeFinancial), supabaseOperationRepository.listInstitutions(true),
      ]);
    } else if (type === "guarantees") {
      [snapshot.farms, snapshot.registrations, snapshot.operations, snapshot.guarantees, snapshot.institutions, snapshot.guaranteeTypes] = await Promise.all([
        supabaseFarmRepository.list(), supabaseRegistrationRepository.list(), supabaseOperationRepository.list(false),
        supabaseGuaranteeRepository.list(includeFinancial), supabaseOperationRepository.listInstitutions(true), supabaseGuaranteeRepository.listTypes(true),
      ]);
    } else if (type === "documents") {
      [snapshot.farms, snapshot.registrations, snapshot.documents, snapshot.documentTypes] = await Promise.all([
        supabaseFarmRepository.list(), supabaseRegistrationRepository.list(), supabaseDocumentRepository.list(), supabaseDocumentTypeRepository.listActive(),
      ]);
    } else {
      [snapshot.farms, snapshot.registrations, snapshot.cars] = await Promise.all([
        supabaseFarmRepository.list(), supabaseRegistrationRepository.list(), supabaseCarRepository.list(),
      ]);
    }
    await verifyCompleteSnapshot(type, snapshot);
    return snapshot;
  },
};
