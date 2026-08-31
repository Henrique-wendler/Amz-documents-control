export type EntityStatus = "active" | "inactive";

export interface Owner {
  id: string;
  type: "individual" | "company";
  name: string;
  document: string;
  phone?: string;
  email?: string;
  status: EntityStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Farm {
  id: string;
  name: string;
  municipality: string;
  state: string;
  location?: string;
  totalArea: number;
  reserveArea?: number;
  consolidatedArea?: number;
  status: EntityStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Registration {
  id: string;
  farmId: string;
  number: string;
  previousNumber?: string;
  legalArea?: number;
  hp?: string;
  certificateDate?: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OwnershipLink {
  id: string;
  ownerId: string;
  registrationId: string;
  type: "owner" | "co-owner" | "usufructuary" | "other";
  percentage?: number;
  status: EntityStatus;
  startDate?: string;
  endDate?: string;
}

export interface Operation {
  id: string;
  farmId: string;
  registrationId?: string;
  number: string;
  bank: string;
  purpose?: string;
  value: number;
  status: "under_review" | "active" | "completed" | "cancelled";
  startDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Guarantee {
  id: string;
  operationId: string;
  registrationId: string;
  bank?: string;
  type: string;
  description?: string;
  degree?: string;
  value?: number;
  evaluationYear?: number;
  status: "active" | "closed" | "cancelled";
  startDate?: string;
  endDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuaranteeItem {
  id: string;
  guaranteeId: string;
  category: string;
  description: string;
  quantity?: number;
  unit?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RuralDocument {
  id: string;
  documentTypeId?: string;
  farmId: string;
  registrationId?: string;
  type: string;
  number?: string;
  issueDate?: string;
  expirationDate?: string;
  status: EntityStatus;
  exercise?: string;
  purpose?: string;
  licensedArea?: number;
  cab?: string;
  sigamStatus?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type DocumentValidityStatus = "active" | "expiring" | "expired" | "inactive";

export interface DocumentAttachment {
  id: string;
  documentId: string;
  fileName: string;
  filePath: string;
  fileType?: string;
  fileSize?: number;
  storageType?: "network_share" | "supabase_storage" | "external";
  status?: "active" | "inactive";
  version?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CarRecord {
  id: string;
  farmId: string;
  registrationId?: string;
  ownerId?: string;
  declaredOwnerName?: string;
  number: string;
  receiptNumber?: string;
  status: "active" | "pending" | "inactive";
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  entityType: "owner" | "farm" | "registration" | "operation" | "guarantee" | "guaranteeItem" | "document" | "car";
  entityId: string;
  action: string;
  userName: string;
  createdAt: string;
}

export interface MockDatabase {
  owners: Owner[];
  farms: Farm[];
  registrations: Registration[];
  ownershipLinks: OwnershipLink[];
  operations: Operation[];
  guarantees: Guarantee[];
  guaranteeItems: GuaranteeItem[];
  documents: RuralDocument[];
  documentAttachments: DocumentAttachment[];
  carRecords: CarRecord[];
  activities: Activity[];
}
