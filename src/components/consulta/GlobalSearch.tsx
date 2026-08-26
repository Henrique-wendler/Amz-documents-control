import { Input } from "@fluentui/react-components";
import { Search24Regular } from "@fluentui/react-icons";

interface GlobalSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function GlobalSearch({ value, onChange }: GlobalSearchProps) {
  return (
    <Input
      className="consulta-search-input"
      size="large"
      aria-label="Pesquisa geral"
      contentBefore={<Search24Regular />}
      placeholder="Pesquisar por nome, matrícula, número da operação, documento, CPF/CNPJ..."
      value={value}
      onChange={(_, data) => onChange(data.value)}
    />
  );
}
