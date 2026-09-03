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
        supabaseFarmRepository.list(), supabaseRegistrationRepository.list(), supabaseOperationRepository.list(includeFinancial), supabaseOperationRepository.listInstitutions(),
      ]);
    } else if (type === "guarantees") {
      [snapshot.farms, snapshot.registrations, snapshot.operations, snapshot.guarantees, snapshot.institutions, snapshot.guaranteeTypes] = await Promise.all([
        supabaseFarmRepository.list(), supabaseRegistrationRepository.list(), supabaseOperationRepository.list(false),
        supabaseGuaranteeRepository.list(includeFinancial), supabaseOperationRepository.listInstitutions(), supabaseGuaranteeRepository.listTypes(),
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
    return snapshot;
  },
};
