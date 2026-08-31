import type { CarRecord, DocumentValidityStatus, EntityStatus, Farm, Guarantee, Operation, Owner, OwnershipLink, Registration, RuralDocument } from "./domain";

export interface RegistrationListItem extends Registration {
  version: number;
  farmName: string;
  farmLocation: string;
  ownerCount: number;
  ownershipLinkCount: number;
  operationCount: number;
  guaranteeCount: number;
  documentCount: number;
  carCount: number;
  activePercentage: number;
}

export interface RegistrationSummary {
  total: number;
  active: number;
  legalArea: number;
  withoutActiveOwner: number;
}

export interface RegistrationFilters {
  query: string;
  farmId: string;
  status: "all" | EntityStatus;
  ownerRelation: "all" | "with" | "without";
  operationRelation: "all" | "with" | "without";
  guaranteeRelation: "all" | "with" | "without";
  hp: "all" | "Sim" | "Não";
  areaRange: "all" | "up-to-1000" | "1000-1800" | "above-1800";
  certificateFrom: string;
  page: number;
  pageSize: number;
}

export interface OwnershipLinkView extends OwnershipLink {
  version: number;
}

export interface RegistrationOwnershipView {
  link: OwnershipLinkView;
  owner: Owner;
}

export interface RegistrationDetailsViewModel {
  registration: RegistrationListItem;
  farm?: Farm;
  ownerships: RegistrationOwnershipView[];
  operations: Operation[];
  guarantees: Guarantee[];
  documents: Array<RuralDocument & { validityStatus: DocumentValidityStatus }>;
  cars: CarRecord[];
  activePercentage: number;
}

export interface RegistrationListResponse {
  records: RegistrationListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: RegistrationSummary;
}

export interface RegistrationFarmOption { id: string; name: string; label: string; }
export interface RegistrationOwnerOption { id: string; name: string; document: string; type: Owner["type"]; label: string; }
export type RegistrationDraft = Required<Pick<Registration, "farmId" | "number" | "previousNumber" | "hp" | "certificateDate" | "status">> & { legalArea?: number };
export type OwnershipDraft = Required<Pick<OwnershipLink, "ownerId" | "type" | "startDate" | "status">> & { percentage?: number };
export type RegistrationLoadMode = "success" | "empty" | "error";
