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
  checksum?: string;
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
  declaredOwnerName?: string;
  number: string;
  receiptNumber?: string;
  status: "active" | "pending" | "inactive";
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
