import type { EntityStatus } from "./domain";

export type CatalogKind = "financialInstitutions" | "guaranteeTypes" | "documentTypes";

export interface CatalogEntry {
  id: string;
  kind: CatalogKind;
  name: string;
  shortName?: string;
  code?: string;
  requiresExpiration?: boolean;
  status: EntityStatus;
  updatedAt: string;
  version: number;
}

export interface CatalogDraft {
  name: string;
  shortName?: string;
  code?: string;
  requiresExpiration?: boolean;
  status: EntityStatus;
}

export interface CatalogAdministrationData {
  financialInstitutions: CatalogEntry[];
  guaranteeTypes: CatalogEntry[];
  documentTypes: CatalogEntry[];
}
