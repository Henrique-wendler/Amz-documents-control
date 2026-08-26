import { Button } from "@fluentui/react-components";
import { Add20Regular, Document24Regular } from "@fluentui/react-icons";

interface RegistrationEmptyStateProps { filtered: boolean; onClear: () => void; onNew: () => void; }

export function RegistrationEmptyState({ filtered, onClear, onNew }: RegistrationEmptyStateProps) {
  return <div className="registration-empty-state"><span className="registration-empty-state__icon"><Document24Regular aria-hidden="true" /></span><h3>{filtered ? "Nenhuma matrícula encontrada" : "Nenhuma matrícula cadastrada"}</h3><p>{filtered ? "Revise os filtros aplicados ou limpe a pesquisa para visualizar todos os registros." : "Cadastre a primeira matrícula para começar."}</p><div>{filtered ? <Button appearance="secondary" onClick={onClear}>Limpar filtros</Button> : null}<Button appearance="primary" icon={<Add20Regular />} onClick={onNew}>Nova matrícula</Button></div></div>;
}
