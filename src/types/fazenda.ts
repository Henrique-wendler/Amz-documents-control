import type { CarRecord, EntityStatus, Farm, Operation, Owner, Registration, RuralDocument } from "./domain";

export interface FarmListItem extends Farm {
  registrationCount: number;
  ownerCount: number;
  activeOperationCount: number;
  operationCount: number;
  documentCount: number;
  carCount: number;
}

export interface FarmSummary {
  total: number;
  active: number;
  totalArea: number;
  registrations: number;
}

export interface FarmFilters {
  query: string;
  status: "all" | EntityStatus;
  state: string;
  municipality: string;
  areaRange: "all" | "up-to-2000" | "2000-3500" | "above-3500";
  hasRegistration: "all" | "yes" | "no";
  hasActiveOperation: "all" | "yes" | "no";
  hasCar: "all" | "yes" | "no";
  page: number;
  pageSize: number;
}

export interface FarmDetailsViewModel {
  farm: FarmListItem;
  registrations: Registration[];
  owners: Owner[];
  operations: Operation[];
  documents: RuralDocument[];
  cars: CarRecord[];
}

export interface FarmListResponse {
  records: FarmListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: FarmSummary;
  states: string[];
  municipalities: string[];
}

export type FarmLoadMode = "success" | "empty" | "error";
export type FarmDraft = Required<Pick<Farm, "name" | "municipality" | "state" | "location" | "totalArea" | "reserveArea" | "consolidatedArea" | "status" | "notes">>;
export type { Farm } from "./domain";
