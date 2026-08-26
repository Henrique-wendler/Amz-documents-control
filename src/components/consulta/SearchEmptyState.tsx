import { Button } from "@fluentui/react-components";
import { SearchInfo24Regular } from "@fluentui/react-icons";

export function SearchEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="search-empty-state">
      <span className="search-empty-state__icon"><SearchInfo24Regular /></span>
      <h3>Nenhum registro encontrado</h3>
      <p>Tente alterar os filtros ou pesquisar por outro termo.</p>
      <Button appearance="primary" onClick={onClear}>Limpar filtros</Button>
    </div>
  );
}
