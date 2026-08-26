import { Button } from "@fluentui/react-components";
import { Add20Regular, Building24Regular } from "@fluentui/react-icons";

interface FarmEmptyStateProps { filtered: boolean; onClear: () => void; onNew: () => void; }

export function FarmEmptyState({ filtered, onClear, onNew }: FarmEmptyStateProps) {
  return <div className="farm-empty-state">
    <span className="farm-empty-state__icon"><Building24Regular aria-hidden="true" /></span>
    <h3>{filtered ? "Nenhuma fazenda encontrada" : "Nenhuma fazenda cadastrada"}</h3>
    <p>{filtered ? "Revise os filtros aplicados ou limpe a pesquisa para visualizar todos os imóveis." : "Cadastre a primeira fazenda para iniciar a gestão territorial."}</p>
    <div>{filtered ? <Button appearance="secondary" onClick={onClear}>Limpar filtros</Button> : null}<Button appearance="primary" icon={<Add20Regular />} onClick={onNew}>Nova fazenda</Button></div>
  </div>;
}
