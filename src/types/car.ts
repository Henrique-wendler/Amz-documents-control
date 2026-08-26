import type { CarRecord, Farm, Owner, Registration } from "./domain";

export type CarLoadMode = "success" | "empty" | "error";

export interface CarFilters {
  query: string;
  farmId: string;
  status: "all" | CarRecord["status"];
  page: number;
  pageSize: number;
}

export interface CarListItem extends CarRecord {
  farmName: string;
  farmLocation: string;
  registrationNumber?: string;
  ownerName?: string;
}

export interface CarSummaryViewModel { total: number; active: number; pending: number; inactive: number; }
export interface CarListResponse { records: CarListItem[]; total: number; page: number; pageSize: number; totalPages: number; summary: CarSummaryViewModel; }
export interface CarDetailsViewModel { car: CarListItem; farm?: Farm; registration?: Registration; owner?: Owner; }
export interface CarOption { id: string; label: string; farmId?: string; }
export interface CarOwnerOption { id: string; label: string; farmIds: string[]; }

export interface CarDraft {
  farmId: string;
  registrationId?: string;
  ownerId?: string;
  number: string;
  receiptNumber?: string;
  status: CarRecord["status"];
}
