export type SearchEntityType =
  | "owner"
  | "farm"
  | "registration"
  | "operation"
  | "guarantee"
  | "document"
  | "car";

export type SearchCategory = "all" | SearchEntityType;

export type SearchStatus =
  | "Ativa"
  | "Ativo"
  | "Em análise"
  | "Encerrada"
  | "Inativa"
  | "Cancelada"
  | "A vencer"
  | "Vencido";

export type SearchSort = "recent" | "name-asc" | "name-desc" | "status" | "updated";

export interface SearchRelation {
  label: string;
  value: string;
}

export interface SearchRecord {
  id: string;
  entityType: SearchEntityType;
  title: string;
  reference: string;
  details: string;
  status: SearchStatus;
  updatedAt: string;
  farmId?: string;
  farmName?: string;
  attributes: Record<string, string>;
  relations: SearchRelation[];
  openPath?: string;
}

export interface SearchFilters {
  query: string;
  category: SearchCategory;
  status: string;
  farmId: string;
  ownerType: string;
  municipality: string;
  state: string;
  bank: string;
  valueRange: string;
  guaranteeType: string;
  documentType: string;
  expiration: string;
  sort: SearchSort;
  page: number;
  pageSize: number;
}

export type SearchCounts = Record<SearchCategory, number>;

export interface SearchResponse {
  records: SearchRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type SearchLoadMode = "success" | "error";
