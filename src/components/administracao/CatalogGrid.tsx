import { useMemo } from "react";
import {
  Button,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Skeleton,
  SkeletonItem,
  Tooltip,
  createTableColumn,
} from "@fluentui/react-components";
import type { TableColumnDefinition } from "@fluentui/react-components";
import { Edit20Regular, MoreHorizontal20Regular, ToggleLeft20Regular, ToggleRight20Regular } from "@fluentui/react-icons";
import type { CatalogEntry, CatalogKind } from "../../types/catalogAdministration";
import { StatusBadge } from "../StatusBadge";

interface CatalogGridProps {
  kind: CatalogKind;
  entries: CatalogEntry[];
  loading: boolean;
  onEdit: (entry: CatalogEntry) => void;
  onToggleStatus: (entry: CatalogEntry) => void;
}

const details = (entry: CatalogEntry) => {
  if (entry.kind === "financialInstitutions") return entry.shortName || "Sem sigla informada";
  if (entry.kind === "documentTypes") return [entry.code || "Sem código", entry.requiresExpiration ? "Exige validade" : "Validade opcional"].join(" · ");
  return "Classificação de garantia";
};

const emptyDescriptions: Record<CatalogKind, string> = {
  financialInstitutions: "Cadastre a primeira instituição financeira desta organização.",
  guaranteeTypes: "Cadastre o primeiro tipo de garantia desta organização.",
  documentTypes: "Cadastre o primeiro tipo de documento desta organização.",
};

export function CatalogGrid({ kind, entries, loading, onEdit, onToggleStatus }: CatalogGridProps) {
  const columns: TableColumnDefinition<CatalogEntry>[] = useMemo(() => [
    createTableColumn({
      columnId: "name",
      compare: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
      renderHeaderCell: () => "Nome",
      renderCell: (entry) => <Tooltip content={entry.name} relationship="description"><span className="search-cell-text search-cell-text--strong">{entry.name}</span></Tooltip>,
    }),
    createTableColumn({
      columnId: "details",
      compare: (a, b) => details(a).localeCompare(details(b), "pt-BR"),
      renderHeaderCell: () => "Configuração",
      renderCell: (entry) => <span className="catalog-administration-grid__details">{details(entry)}</span>,
    }),
    createTableColumn({
      columnId: "status",
      compare: (a, b) => a.status.localeCompare(b.status),
      renderHeaderCell: () => "Situação",
      renderCell: (entry) => <StatusBadge status={entry.status === "active" ? "Ativo" : "Inativo"} />,
    }),
    createTableColumn({
      columnId: "updated",
      compare: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
      renderHeaderCell: () => "Atualizado em",
      renderCell: (entry) => entry.updatedAt,
    }),
    createTableColumn({
      columnId: "actions",
      renderHeaderCell: () => "Ações",
      renderCell: (entry) => <div className="catalog-administration-grid__actions" onClick={(event) => event.stopPropagation()}>
        <Menu positioning="below-end">
          <MenuTrigger disableButtonEnhancement><Button appearance="subtle" size="small" icon={<MoreHorizontal20Regular />} aria-label={`Ações para ${entry.name}`} /></MenuTrigger>
          <MenuPopover><MenuList>
            <MenuItem icon={<Edit20Regular />} onClick={() => onEdit(entry)}>Editar</MenuItem>
            <MenuItem icon={entry.status === "active" ? <ToggleLeft20Regular /> : <ToggleRight20Regular />} onClick={() => onToggleStatus(entry)}>{entry.status === "active" ? "Inativar" : "Reativar"}</MenuItem>
          </MenuList></MenuPopover>
        </Menu>
      </div>,
    }),
  ], [onEdit, onToggleStatus]);

  if (loading) return <Skeleton className="search-results-skeleton" aria-label="Carregando catálogo">{Array.from({ length: 6 }, (_, index) => <SkeletonItem key={index} shape="rectangle" size={40} />)}</Skeleton>;
  if (!entries.length) return <div className="catalog-administration-empty"><strong>Nenhum item encontrado</strong><span>{emptyDescriptions[kind]}</span></div>;

  return <div className="data-grid-wrap catalog-administration-grid" aria-label="Itens do catálogo">
    <DataGrid items={entries} columns={columns} size="small" sortable getRowId={(entry) => entry.id}>
      <DataGridHeader><DataGridRow>{({ renderHeaderCell, columnId }) => <DataGridHeaderCell className={`catalog-column--${String(columnId)}`}>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow></DataGridHeader>
      <DataGridBody<CatalogEntry>>{({ item, rowId }) => <DataGridRow<CatalogEntry> key={rowId} onClick={() => onEdit(item)}>{({ renderCell, columnId }) => <DataGridCell className={`catalog-column--${String(columnId)}`}>{renderCell(item)}</DataGridCell>}</DataGridRow>}</DataGridBody>
    </DataGrid>
  </div>;
}
