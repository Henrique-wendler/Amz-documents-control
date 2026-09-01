import type { FinancialInstitutionOption, GuaranteeTypeOption, OperationRegistrationOption } from "./operacao";

export type OperationFormStatus = "Em análise" | "Ativa" | "Concluída" | "Cancelada";
export type GuaranteeFormStatus = "Ativa" | "Encerrada" | "Cancelada";

export interface OperationFormModel {
  id: string;
  version: number;
  financialVersion?: number;
  institutionId: string;
  registrationIds: string[];
  primaryRegistrationId: string;
  matricula: string;
  banco: string;
  numero: string;
  finalidade: string;
  valor: string;
  situacao: OperationFormStatus;
  dataInicio: string;
  dataFim: string;
  observacoes: string;
}

export interface GuaranteeFormModel {
  id: string;
  version: number;
  financialVersion?: number;
  operationId: string;
  guaranteeTypeIds: string[];
  primaryGuaranteeTypeId: string;
  registrationIds: string[];
  numeroOperacao: string;
  matricula: string;
  fazenda: string;
  banco: string;
  tipo: string;
  descricao: string;
  grau: string;
  valor: string;
  anoAvaliacao: string;
  situacao: GuaranteeFormStatus;
  dataInicio: string;
  dataVencimento: string;
  observacoes: string;
}

export interface GuaranteeItemFormModel {
  id: string;
  version: number;
  guaranteeId: string;
  categoria: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  observacoes: string;
}

export interface OperationOption { id: string; label: string; }

export interface AppData {
  operation: OperationFormModel;
  operations: OperationOption[];
  guarantees: GuaranteeFormModel[];
  items: GuaranteeItemFormModel[];
  institutions: FinancialInstitutionOption[];
  registrations: OperationRegistrationOption[];
  guaranteeTypes: GuaranteeTypeOption[];
}
