export type OperationStatus = "under_review" | "active" | "completed" | "cancelled";
export type GuaranteeStatus = "active" | "closed" | "cancelled";

export interface OperationRegistrationLink {
  registrationId: string;
  isPrimary: boolean;
}

export interface OperationRecord {
  id: string;
  operationNumber: string;
  institutionId: string;
  purpose?: string;
  status: OperationStatus;
  startDate?: string;
  endDate?: string;
  notes?: string;
  registrations: OperationRegistrationLink[];
  amount?: number;
  financialVersion?: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface OperationInput {
  operationNumber: string;
  institutionId: string;
  purpose?: string;
  status: OperationStatus;
  startDate?: string;
  endDate?: string;
  notes?: string;
  registrationIds: string[];
  primaryRegistrationId: string;
  amount?: number;
  expectedFinancialVersion?: number;
}

export interface GuaranteeTypeLink {
  guaranteeTypeId: string;
  isPrimary: boolean;
}

export interface GuaranteeRecord {
  id: string;
  operationId: string;
  description?: string;
  degree?: string;
  evaluationYear?: number;
  status: GuaranteeStatus;
  startDate?: string;
  endDate?: string;
  notes?: string;
  types: GuaranteeTypeLink[];
  registrationIds: string[];
  amount?: number;
  financialVersion?: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface GuaranteeInput {
  operationId: string;
  description?: string;
  degree?: string;
  evaluationYear?: number;
  status: GuaranteeStatus;
  startDate?: string;
  endDate?: string;
  notes?: string;
  guaranteeTypeIds: string[];
  primaryGuaranteeTypeId: string;
  registrationIds: string[];
  amount?: number;
  expectedFinancialVersion?: number;
}

export interface GuaranteeItemRecord {
  id: string;
  guaranteeId: string;
  category: string;
  description: string;
  quantity?: number;
  unit?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface GuaranteeItemInput {
  guaranteeId: string;
  category: string;
  description: string;
  quantity?: number;
  unit?: string;
  notes?: string;
}

export interface FinancialInstitutionOption {
  id: string;
  name: string;
  shortName?: string;
  status?: "active" | "inactive";
}

export interface GuaranteeTypeOption {
  id: string;
  name: string;
  status?: "active" | "inactive";
}

export interface OperationRegistrationOption {
  id: string;
  number: string;
  farmId: string;
  farmName: string;
  label: string;
}

export interface RelatedOperationView {
  id: string;
  operationNumber: string;
  institutionName: string;
  purpose?: string;
  status: OperationStatus;
  registrationIds: string[];
  primaryRegistrationId?: string;
}

export interface RelatedGuaranteeView {
  id: string;
  operationId: string;
  typeNames: string[];
  primaryTypeName?: string;
  status: GuaranteeStatus;
  registrationIds: string[];
}
