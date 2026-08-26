import type { DocumentAttachment, DocumentValidityStatus, EntityStatus, Farm, Registration, RuralDocument } from "./domain";

export type DocumentLoadMode = "success" | "empty" | "error";
export type DocumentRelationFilter = "all" | "with" | "without";

export interface DocumentFilters {
  query: string;
  type: string;
  status: "all" | DocumentValidityStatus;
  farmId: string;
  registrationId: string;
  exercise: string;
  purpose: string;
  attachmentRelation: DocumentRelationFilter;
  expirationWindow: "all" | "30" | "60" | "90";
  page: number;
  pageSize: number;
}

export interface DocumentListItem extends RuralDocument {
  farmName: string;
  farmLocation: string;
  registrationNumber?: string;
  validityStatus: DocumentValidityStatus;
  daysUntilExpiration?: number;
  attachmentCount: number;
}

export interface DocumentSummaryViewModel { total: number; active: number; expiring: number; expired: number; }
export interface DocumentListResponse { records: DocumentListItem[]; total: number; page: number; pageSize: number; totalPages: number; summary: DocumentSummaryViewModel; }
export interface DocumentDetailsViewModel { document: DocumentListItem; farm?: Farm; registration?: Registration; attachments: DocumentAttachment[]; }
export interface DocumentOption { id: string; label: string; farmId?: string; }

export interface DocumentDraft {
  farmId: string;
  registrationId?: string;
  type: string;
  number?: string;
  exercise?: string;
  issueDate?: string;
  expirationDate?: string;
  purpose?: string;
  licensedArea?: number;
  cab?: string;
  sigamStatus?: string;
  status: EntityStatus;
  notes?: string;
}

export interface AttachmentDraft { fileName: string; filePath: string; fileType?: string; fileSize?: number; }

