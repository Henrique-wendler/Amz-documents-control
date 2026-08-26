import { useMemo } from "react";
import { Button, DataGrid, DataGridBody, DataGridCell, DataGridHeader, DataGridHeaderCell, DataGridRow, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Skeleton, SkeletonItem, Tooltip, createTableColumn } from "@fluentui/react-components";
import type { TableColumnDefinition } from "@fluentui/react-components";
import { ChevronLeft20Regular, ChevronRight20Regular, Delete20Regular, Edit20Regular, Eye20Regular, MoreHorizontal20Regular, PersonProhibited20Regular } from "@fluentui/react-icons";
import { formatArea } from "../../services/searchUtils";
import type { FarmListItem } from "../../types/fazenda";
import { StatusBadge } from "../StatusBadge";
import { FarmEmptyState } from "./FarmEmptyState";

interface FarmGridProps {
  records: FarmListItem[]; loading: boolean; filtered: boolean; page: number; totalPages: number;
  onView: (farm: FarmListItem) => void; onEdit: (farm: FarmListItem) => void; onInactivate: (farm: FarmListItem) => void; onDelete: (farm: FarmListItem) => void;
  onPageChange: (page: number) => void; onClear: () => void; onNew: () => void;
}

const textCell = (value: string, strong = false) => <Tooltip content={value} relationship="description"><span className={`search-cell-text${strong ? " search-cell-text--strong" : ""}`}>{value}</span></Tooltip>;

export function FarmGrid({ records, loading, filtered, page, totalPages, onView, onEdit, onInactivate, onDelete, onPageChange, onClear, onNew }: FarmGridProps) {
  const columns: TableColumnDefinition<FarmListItem>[] = useMemo(() => [
    createTableColumn({ columnId: "name", compare: (a, b) => a.name.localeCompare(b.name, "pt-BR"), renderHeaderCell: () => "Fazenda", renderCell: (farm) => textCell(farm.name, true) }),
    createTableColumn({ columnId: "location", compare: (a, b) => a.municipality.localeCompare(b.municipality, "pt-BR"), renderHeaderCell: () => "Município / UF", renderCell: (farm) => textCell(`${farm.municipality} / ${farm.state}`) }),
    createTableColumn({ columnId: "area", compare: (a, b) => a.totalArea - b.totalArea, renderHeaderCell: () => "Área total", renderCell: (farm) => formatArea(farm.totalArea) }),
    createTableColumn({ columnId: "registrations", compare: (a, b) => a.registrationCount - b.registrationCount, renderHeaderCell: () => "Matrículas", renderCell: (farm) => farm.registrationCount }),
    createTableColumn({ columnId: "owners", compare: (a, b) => a.ownerCount - b.ownerCount, renderHeaderCell: () => "Proprietários", renderCell: (farm) => farm.ownerCount }),
    createTableColumn({ columnId: "operations", compare: (a, b) => a.activeOperationCount - b.activeOperationCount, renderHeaderCell: () => "Operações ativas", renderCell: (farm) => farm.activeOperationCount }),
    createTableColumn({ columnId: "status", compare: (a, b) => a.status.localeCompare(b.status), renderHeaderCell: () => "Situação", renderCell: (farm) => <StatusBadge status={farm.status === "active" ? "Ativa" : "Inativa"} /> }),
    createTableColumn({ columnId: "updated", compare: (a, b) => a.updatedAt.localeCompare(b.updatedAt), renderHeaderCell: () => "Atualizado", renderCell: (farm) => farm.updatedAt }),
    createTableColumn({ columnId: "actions", renderHeaderCell: () => "Ações", renderCell: (farm) => <div className="farm-grid__actions" onClick={(event) => event.stopPropagation()}>
      <Tooltip content={`Visualizar ${farm.name}`} relationship="label"><Button appearance="subtle" size="small" icon={<Eye20Regular />} aria-label={`Visualizar ${farm.name}`} onClick={() => onView(farm)} /></Tooltip>
      <Menu positioning="below-end"><MenuTrigger disableButtonEnhancement><Button appearance="subtle" size="small" icon={<MoreHorizontal20Regular />} aria-label={`Mais ações para ${farm.name}`} /></MenuTrigger><MenuPopover><MenuList>
        <MenuItem icon={<Eye20Regular />} onClick={() => onView(farm)}>Visualizar</MenuItem><MenuItem icon={<Edit20Regular />} onClick={() => onEdit(farm)}>Editar</MenuItem><MenuItem icon={<PersonProhibited20Regular />} disabled={farm.status === "inactive"} onClick={() => onInactivate(farm)}>Inativar</MenuItem><MenuItem className="farm-menu-danger" icon={<Delete20Regular />} onClick={() => onDelete(farm)}>Excluir</MenuItem>
      </MenuList></MenuPopover></Menu>
    </div> }),
  ], [onDelete, onEdit, onInactivate, onView]);

  if (loading) return <Skeleton className="search-results-skeleton" aria-label="Carregando fazendas">{Array.from({ length: 7 }, (_, index) => <SkeletonItem key={index} shape="rectangle" size={40} />)}</Skeleton>;
  if (!records.length) return <FarmEmptyState filtered={filtered} onClear={onClear} onNew={onNew} />;
  return <>
    <div className="data-grid-wrap farm-grid" aria-label="Lista de fazendas"><DataGrid items={records} columns={columns} size="small" sortable getRowId={(farm) => farm.id}>
      <DataGridHeader><DataGridRow>{({ renderHeaderCell, columnId }) => <DataGridHeaderCell className={`farm-column--${String(columnId)}`}>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow></DataGridHeader>
      <DataGridBody<FarmListItem>>{({ item, rowId }) => <DataGridRow<FarmListItem> key={rowId} onClick={() => onView(item)}>{({ renderCell, columnId }) => <DataGridCell className={`farm-column--${String(columnId)}`}>{renderCell(item)}</DataGridCell>}</DataGridRow>}</DataGridBody>
    </DataGrid></div>
    <nav className="consulta-pagination" aria-label="Paginação de fazendas"><Button appearance="subtle" size="small" icon={<ChevronLeft20Regular />} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</Button><div className="consulta-pagination__pages">{Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => <Button key={pageNumber} appearance={pageNumber === page ? "primary" : "subtle"} size="small" aria-current={pageNumber === page ? "page" : undefined} onClick={() => onPageChange(pageNumber)}>{pageNumber}</Button>)}</div><Button appearance="subtle" size="small" iconPosition="after" icon={<ChevronRight20Regular />} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Próxima</Button></nav>
  </>;
}
