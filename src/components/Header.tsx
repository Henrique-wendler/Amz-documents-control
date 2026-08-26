import { Avatar, Button, Tooltip } from "@fluentui/react-components";
import { ArrowSync20Regular } from "@fluentui/react-icons";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  refreshing?: boolean;
  onRefresh: () => void;
}

export function Header({
  title = "Operações e Garantias",
  subtitle = "Gestão de operações financeiras e garantias vinculadas",
  refreshing = false,
  onRefresh,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="app-header__actions">
        <Tooltip content="Recarregar os dados do protótipo" relationship="label">
          <Button
            appearance="subtle"
            disabled={refreshing}
            icon={<ArrowSync20Regular className={refreshing ? "refresh-icon--active" : ""} />}
            onClick={onRefresh}
          >
            Atualizar
          </Button>
        </Tooltip>
        <Avatar initials="US" name="Usuário do sistema" color="colorful" />
      </div>
    </header>
  );
}
