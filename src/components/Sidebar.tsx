import {
  Building24Regular,
  ChartMultiple24Regular,
  Document24Regular,
  Folder24Regular,
  Home24Regular,
  Money24Regular,
  People24Regular,
  Search24Regular,
  Shield24Regular,
  Settings24Regular,
} from "@fluentui/react-icons";
import type { ComponentType } from "react";
import { usePermissions } from "../hooks/usePermissions";

interface NavItem {
  label: string;
  icon: ComponentType;
  path?: string;
  permission?: string;
}

const items: NavItem[] = [
  { label: "Visão Geral", icon: Home24Regular, path: "/dashboard" },
  { label: "Consulta Geral", icon: Search24Regular, path: "/consulta" },
  { label: "Proprietários", icon: People24Regular, path: "/proprietarios" },
  { label: "Fazendas", icon: Building24Regular, path: "/fazendas" },
  { label: "Matrículas", icon: Document24Regular, path: "/matriculas" },
  { label: "Operações e Garantias", icon: Money24Regular, path: "/" },
  { label: "Documentos", icon: Folder24Regular, path: "/documentos" },
  { label: "CAR", icon: Shield24Regular, path: "/car" },
  { label: "Relatórios", icon: ChartMultiple24Regular, path: "/relatorios" },
  { label: "Administração · Usuários", icon: Settings24Regular, path: "/administracao/usuarios", permission: "users.manage" },
];

interface SidebarProps {
  activePath?: string;
  onNavigate?: (path: string) => void;
}

export function Sidebar({ activePath = "/", onNavigate }: SidebarProps) {
  const { hasPermission } = usePermissions();
  return (
    <aside className="sidebar" aria-label="Navegação principal">
      <div className="sidebar__title">
        <span>Sistema de Gestão</span>
        <strong>Imóveis Rurais</strong>
      </div>
      <nav className="sidebar__nav">
        {items.filter((item) => !item.permission || hasPermission(item.permission)).map(({ label, icon: Icon, path }) => {
          const active = path === activePath;
          return (
            <button
              type="button"
              key={label}
              className={`sidebar__item${active ? " sidebar__item--active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={path && onNavigate ? () => onNavigate(path) : undefined}
            >
              <Icon />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
