import { Avatar, Button, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Tooltip } from "@fluentui/react-components";
import { ArrowExit20Regular, ArrowSync20Regular } from "@fluentui/react-icons";
import { useAuth } from "../contexts/AuthContext";

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
  const { profile, signOut } = useAuth();
  const initials = profile?.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR"))
    .join("") || "US";
  const roleLabel = ({ admin: "Administrador", manager: "Gestor", operator: "Operador", viewer: "Consulta" } as Record<string, string>)[profile?.role_key ?? ""] ?? profile?.role_key;

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
        <Menu positioning="below-end">
          <MenuTrigger disableButtonEnhancement>
            <Button className="user-menu-trigger" appearance="subtle" aria-label="Abrir menu do usuário">
              <Avatar initials={initials} name={profile?.full_name ?? "Usuário do sistema"} color="colorful" />
            </Button>
          </MenuTrigger>
          <MenuPopover className="user-menu-popover">
            <div className="user-menu-profile">
              <strong>{profile?.full_name}</strong>
              <span>{roleLabel}</span>
            </div>
            <MenuList>
              <MenuItem icon={<ArrowExit20Regular />} onClick={() => void signOut()}>Sair</MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    </header>
  );
}
