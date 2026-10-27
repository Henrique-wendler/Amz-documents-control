import {
  Building24Regular,
  BookDatabase24Regular,
  ChartMultiple24Regular,
  Document24Regular,
  Folder24Regular,
  Home24Regular,
  Money24Regular,
  People24Regular,
  Search24Regular,
  Shield24Regular,
  Settings24Regular,
  Warning24Regular,
} from "@fluentui/react-icons";
import type { ComponentType } from "react";
import { usePermissions } from "../hooks/usePermissions";
import { BrandLogo } from "./BrandLogo";

interface NavItem {
  label: string;
  icon: ComponentType;
  path?: string;
  permission?: string;
  group: "Gestão" | "Imóveis" | "Operações" | "Análise" | "Sistema";
}

const items: NavItem[] = [
  { label: "Visão Geral", icon: Home24Regular, path: "/dashboard", group: "Gestão" },
  { label: "Consulta Geral", icon: Search24Regular, path: "/consulta", group: "Gestão" },
  { label: "Proprietários", icon: People24Regular, path: "/proprietarios", group: "Imóveis" },
  { label: "Fazendas", icon: Building24Regular, path: "/fazendas", group: "Imóveis" },
  { label: "Matrículas", icon: Document24Regular, path: "/matriculas", group: "Imóveis" },
  { label: "CAR", icon: Shield24Regular, path: "/car", group: "Imóveis" },
  { label: "Operações e Garantias", icon: Money24Regular, path: "/", group: "Operações" },
  { label: "Documentos", icon: Folder24Regular, path: "/documentos", group: "Operações" },
  { label: "Pendências", icon: Warning24Regular, path: "/pendencias", permission: "pending_issues.read", group: "Operações" },
  { label: "Acompanhamento de Propostas", icon: ChartMultiple24Regular, path: "/acompanhamento-propostas", permission: "proposal_reports.read", group: "Análise" },
  { label: "Relatórios", icon: ChartMultiple24Regular, path: "/relatorios", group: "Análise" },
  { label: "Administração · Usuários", icon: Settings24Regular, path: "/administracao/usuarios", permission: "users.manage", group: "Sistema" },
  { label: "Administração · Catálogos", icon: BookDatabase24Regular, path: "/administracao/catalogos", permission: "catalogs.manage", group: "Sistema" },
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
        <BrandLogo />
        <span>Sistema de Gestão</span>
        <strong>Imóveis Rurais</strong>
      </div>
      <nav className="sidebar__nav">
        {items.filter((item) => !item.permission || hasPermission(item.permission)).map(({ label, icon: Icon, path, group }, index, visible) => {
          const active = path === activePath;
          return (
            <div className="sidebar__nav-entry" key={label}>
            {index === 0 || visible[index - 1].group !== group ? <span className="sidebar__group">{group}</span> : null}
            <button
              type="button"
              className={`sidebar__item${active ? " sidebar__item--active" : ""}`}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              onClick={path && onNavigate ? () => onNavigate(path) : undefined}
            >
              <Icon />
              <span>{label}</span>
            </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
