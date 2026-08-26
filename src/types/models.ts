export type OperationFormStatus = "Em análise" | "Ativa" | "Concluída" | "Cancelada";
export type GuaranteeFormStatus = "Ativa" | "Encerrada" | "Em análise" | "Cancelada";

export interface OperationFormModel {
  id: string;
  matricula: string;
  banco: string;
  numero: string;
  finalidade: string;
  valor: string;
  situacao: OperationFormStatus;
  dataInicio: string;
}

export interface GuaranteeFormModel {
  id: string;
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
  guaranteeId: string;
  categoria: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  observacoes: string;
}

export interface AppData {
  operation: OperationFormModel;
  guarantees: GuaranteeFormModel[];
  items: GuaranteeItemFormModel[];
}

