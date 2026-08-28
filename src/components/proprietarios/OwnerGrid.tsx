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
import {
  ChevronLeft20Regular,
  ChevronRight20Regular,
  Delete20Regular,
  Edit20Regular,
  Eye20Regular,
  MoreHorizontal20Regular,
  PersonProhibited20Regular,
} from "@fluentui/react-icons";
import type { OwnerListItem } from "../../types/proprietario";
import { StatusBadge } from "../StatusBadge";
import { OwnerEmptyState } from "./OwnerEmptyState";

interface OwnerGridProps {
  records: OwnerListItem[];
  loading: boolean;
  filtered: boolean;
  page: number;
  totalPages: number;
  canWrite: boolean;
  canInactivate: boolean;
  canDelete: boolean;
  onView: (owner: OwnerListItem) => void;
  onEdit: (owner: OwnerListItem) => void;
  onInactivate: (owner: OwnerListItem) => void;
  onDelete: (owner: OwnerListItem) => void;
  onPageChange: (page: number) => void;
  onClear: () => void;
  onNew: () => void;
}

const textCell = (value: string, strong = false) => (
  <Tooltip content={value} relationship="description">
    <span className={`search-cell-text${strong ? " search-cell-text--strong" : ""}`}>{value}</span>
  </Tooltip>
);

export function OwnerGrid({ records, loading, filtered, page, totalPages, canWrite, canInactivate, canDelete, onView, onEdit, onInactivate, onDelete, onPageChange, onClear, onNew }: OwnerGridProps) {
  const columns: TableColumnDefinition<OwnerListItem>[] = useMemo(() => [
    createTableColumn({ columnId: "name", compare: (a, b) => a.name.localeCompare(b.name, "pt-BR"), renderHeaderCell: () => "Nome / Razão social", renderCell: (owner: OwnerListItem) => textCell(owner.name, true) }),
    createTableColumn({ columnId: "document", compare: (a, b) => a.document.localeCompare(b.document), renderHeaderCell: () => "CPF/CNPJ", renderCell: (owner: OwnerListItem) => textCell(owner.document) }),
    createTableColumn({ columnId: "type", compare: (a, b) => a.type.localeCompare(b.type), renderHeaderCell: () => "Tipo", renderCell: (owner: OwnerListItem) => owner.type === "individual" ? "Pessoa Física" : "Pessoa Jurídica" }),
    createTableColumn({ columnId: "phone", compare: (a, b) => (a.phone ?? "").localeCompare(b.phone ?? ""), renderHeaderCell: () => "Telefone", renderCell: (owner: OwnerListItem) => textCell(owner.phone || "—") }),
    createTableColumn({ columnId: "farms", compare: (a, b) => a.farmCount - b.farmCount, renderHeaderCell: () => "Fazendas", renderCell: (owner: OwnerListItem) => owner.farmCount }),
    createTableColumn({ columnId: "registrations", compare: (a, b) => a.registrationCount - b.registrationCount, renderHeaderCell: () => "Matrículas", renderCell: (owner: OwnerListItem) => owner.registrationCount }),
    createTableColumn({ columnId: "status", compare: (a, b) => a.status.localeCompare(b.status), renderHeaderCell: () => "Situação", renderCell: (owner: OwnerListItem) => <StatusBadge status={owner.status === "active" ? "Ativo" : "Inativo"} /> }),
    createTableColumn({ columnId: "updated", compare: (a, b) => a.updatedAt.localeCompare(b.updatedAt), renderHeaderCell: () => "Atualizado em", renderCell: (owner: OwnerListItem) => owner.updatedAt }),
    createTableColumn({
      columnId: "actions",
      renderHeaderCell: () => "Ações",
      renderCell: (owner: OwnerListItem) => (
        <div className="owner-grid__actions" onClick={(event) => event.stopPropagation()}>
          <Tooltip content={`Visualizar ${owner.name}`} relationship="label">
            <Button appearance="subtle" size="small" icon={<Eye20Regular />} aria-label={`Visualizar ${owner.name}`} onClick={() => onView(owner)} />
          </Tooltip>
          {canWrite || canInactivate || canDelete ? <Menu positioning="below-end">
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="subtle" size="small" icon={<MoreHorizontal20Regular />} aria-label={`Mais ações para ${owner.name}`} />
            </MenuTrigger>
            <MenuPopover><MenuList>
              <MenuItem icon={<Eye20Regular />} onClick={() => onView(owner)}>Visualizar</MenuItem>
              {canWrite ? <MenuItem icon={<Edit20Regular />} onClick={() => onEdit(owner)}>Editar</MenuItem> : null}
              {canInactivate ? <MenuItem icon={<PersonProhibited20Regular />} disabled={owner.status === "inactive"} onClick={() => onInactivate(owner)}>Inativar</MenuItem> : null}
              {canDelete ? <MenuItem className="owner-menu-danger" icon={<Delete20Regular />} onClick={() => onDelete(owner)}>Excluir</MenuItem> : null}
            </MenuList></MenuPopover>
          </Menu> : null}
        </div>
      ),
    }),
  ], [canDelete, canInactivate, canWrite, onDelete, onEdit, onInactivate, onView]);

  if (loading) {
    return <Skeleton className="search-results-skeleton" aria-label="Carregando proprietários">{Array.from({ length: 8 }, (_, index) => <SkeletonItem key={index} shape="rectangle" size={40} />)}</Skeleton>;
  }

  if (!records.length) return <OwnerEmptyState filtered={filtered} canCreate={canWrite} onClear={onClear} onNew={onNew} />;

  return (
    <>
      <div className="data-grid-wrap owner-grid" aria-label="Lista de proprietários">
        <DataGrid items={records} columns={columns} size="small" sortable getRowId={(owner) => owner.id}>
          <DataGridHeader><DataGridRow>{({ renderHeaderCell, columnId }) => <DataGridHeaderCell className={`owner-column--${String(columnId)}`}>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow></DataGridHeader>
          <DataGridBody<OwnerListItem>>{({ item, rowId }) => (
            <DataGridRow<OwnerListItem> key={rowId} onClick={() => onView(item)}>{({ renderCell, columnId }) => <DataGridCell className={`owner-column--${String(columnId)}`}>{renderCell(item)}</DataGridCell>}</DataGridRow>
          )}</DataGridBody>
        </DataGrid>
      </div>
      <nav className="consulta-pagination" aria-label="Paginação de proprietários">
        <Button appearance="subtle" size="small" icon={<ChevronLeft20Regular />} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</Button>
        <div className="consulta-pagination__pages">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => <Button key={pageNumber} appearance={pageNumber === page ? "primary" : "subtle"} size="small" aria-current={pageNumber === page ? "page" : undefined} onClick={() => onPageChange(pageNumber)}>{pageNumber}</Button>)}
        </div>
        <Button appearance="subtle" size="small" iconPosition="after" icon={<ChevronRight20Regular />} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Próxima</Button>
      </nav>
    </>
  );
}
