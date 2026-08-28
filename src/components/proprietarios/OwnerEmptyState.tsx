import { Button } from "@fluentui/react-components";
import { Add20Regular, People24Regular } from "@fluentui/react-icons";

interface OwnerEmptyStateProps {
  filtered: boolean;
  canCreate: boolean;
  onClear: () => void;
  onNew: () => void;
}

export function OwnerEmptyState({ filtered, canCreate, onClear, onNew }: OwnerEmptyStateProps) {
  return (
    <div className="owner-empty-state">
      <span className="owner-empty-state__icon"><People24Regular aria-hidden="true" /></span>
      <h3>{filtered ? "Nenhum proprietário encontrado" : "Nenhum proprietário cadastrado"}</h3>
      <p>{filtered ? "Revise os filtros aplicados ou limpe a pesquisa para ver todos os cadastros." : "Cadastre o primeiro proprietário para começar a organizar os vínculos rurais."}</p>
      <div>
        {filtered ? <Button appearance="secondary" onClick={onClear}>Limpar filtros</Button> : null}
        {canCreate ? <Button appearance="primary" icon={<Add20Regular />} onClick={onNew}>Novo proprietário</Button> : null}
      </div>
    </div>
  );
}
