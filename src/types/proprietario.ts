import type { EntityStatus, Owner } from "./domain";

export type OwnerType = Owner["type"];
export type OwnerStatus = EntityStatus;

export interface OwnerFarmLink {
  id: string;
  name: string;
  location: string;
  area: string;
  status: EntityStatus;
}

export interface OwnerListItem extends Owner {
  version: number;
  farmCount: number;
  registrationCount: number;
  operationCount: number;
}

export interface OwnerWithRelations {
  owner: OwnerListItem;
  farms: OwnerFarmLink[];
}

export interface OwnerSummary {
  total: number;
  individuals: number;
  companies: number;
  inactive: number;
}

export interface OwnerFilters {
  query: string;
  type: "all" | OwnerType;
  status: "all" | OwnerStatus;
  farmId: string;
  page: number;
  pageSize: number;
}

export interface OwnerListResponse {
  records: OwnerListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: OwnerSummary;
}

export type OwnerLoadMode = "success" | "empty" | "error";
export type OwnerDraft = Required<Pick<Owner, "type" | "name" | "document" | "phone" | "email" | "status" | "notes">>;
export type { Owner } from "./domain";
