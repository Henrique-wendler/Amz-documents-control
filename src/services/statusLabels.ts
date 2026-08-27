import type { CarRecord, DocumentValidityStatus, Operation } from "../types/domain";

export const operationStatusLabels: Record<Operation["status"], "Ativa" | "Em análise" | "Concluída" | "Cancelada"> = {
  active: "Ativa",
  under_review: "Em análise",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const carStatusLabels: Record<CarRecord["status"], "Ativo" | "Pendente" | "Inativo"> = {
  active: "Ativo",
  pending: "Pendente",
  inactive: "Inativo",
};

export const documentValidityLabels: Record<DocumentValidityStatus, "Vigente" | "A vencer" | "Vencido" | "Inativo"> = {
  active: "Vigente",
  expiring: "A vencer",
  expired: "Vencido",
  inactive: "Inativo",
};

export const searchStatusLabels = [
  "Ativa",
  "Ativo",
  "Em análise",
  "Pendente",
  "Concluída",
  "Encerrada",
  "Inativa",
  "Inativo",
  "Cancelada",
  "Vigente",
  "A vencer",
  "Vencido",
] as const;
