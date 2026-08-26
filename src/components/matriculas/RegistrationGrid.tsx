import { useMemo } from "react";
import { Button, DataGrid, DataGridBody, DataGridCell, DataGridHeader, DataGridHeaderCell, DataGridRow, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Skeleton, SkeletonItem, Tooltip, createTableColumn } from "@fluentui/react-components";
import type { TableColumnDefinition } from "@fluentui/react-components";
import { ChevronLeft20Regular, ChevronRight20Regular, Delete20Regular, Edit20Regular, Eye20Regular, MoreHorizontal20Regular, People20Regular, PersonProhibited20Regular } from "@fluentui/react-icons";
import { formatArea } from "../../services/searchUtils";
import type { RegistrationListItem } from "../../types/matricula";
import { StatusBadge } from "../StatusBadge";
import { RegistrationEmptyState } from "./RegistrationEmptyState";

interface RegistrationGridProps {
  records: RegistrationListItem[]; loading: boolean; filtered: boolean; page: number; totalPages: number;
  onView: (record: RegistrationListItem) => void; onEdit: (record: RegistrationListItem) => void; onManageOwners: (record: RegistrationListItem) => void; onInactivate: (record: RegistrationListItem) => void; onDelete: (record: RegistrationListItem) => void;
  onPageChange: (page: number) => void; onClear: () => void; onNew: () => void;
}

const displayDate = (value?: string) => {
  if (!value) return "—";
  if (value.includes("/")) return value;
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
};
const textCell = (value: string, strong = false) => <Tooltip content={value} relationship="description"><span className={`search-cell-text${strong ? " search-cell-text--strong" : ""}`}>{value}</span></Tooltip>;

export function RegistrationGrid({ records, loading, filtered, page, totalPages, onView, onEdit, onManageOwners, onInactivate, onDelete, onPageChange, onClear, onNew }: RegistrationGridProps) {
  const columns: TableColumnDefinition<RegistrationListItem>[] = useMemo(() => [
    createTableColumn({ columnId: "number", compare: (a, b) => a.number.localeCompare(b.number, "pt-BR", { numeric: true }), renderHeaderCell: () => "Matrícula", renderCell: (record) => textCell(record.number, true) }),
    createTableColumn({ columnId: "farm", compare: (a, b) => a.farmName.localeCompare(b.farmName, "pt-BR"), renderHeaderCell: () => "Fazenda", renderCell: (record) => textCell(record.farmName) }),
    createTableColumn({ columnId: "area", compare: (a, b) => (a.legalArea ?? 0) - (b.legalArea ?? 0), renderHeaderCell: () => "Área legal", renderCell: (record) => record.legalArea === undefined ? "—" : formatArea(record.legalArea) }),
    createTableColumn({ columnId: "owners", compare: (a, b) => a.ownerCount - b.ownerCount, renderHeaderCell: () => "Proprietários", renderCell: (record) => `${record.ownerCount} ${record.ownerCount === 1 ? "proprietário" : "proprietários"}` }),
    createTableColumn({ columnId: "hp", compare: (a, b) => (a.hp ?? "").localeCompare(b.hp ?? ""), renderHeaderCell: () => "HP", renderCell: (record) => record.hp || "—" }),
    createTableColumn({ columnId: "certificate", compare: (a, b) => (a.certificateDate ?? "").localeCompare(b.certificateDate ?? ""), renderHeaderCell: () => "Data da certidão", renderCell: (record) => displayDate(record.certificateDate) }),
    createTableColumn({ columnId: "operations", compare: (a, b) => a.operationCount - b.operationCount, renderHeaderCell: () => "Operações", renderCell: (record) => record.operationCount }),
    createTableColumn({ columnId: "status", compare: (a, b) => a.status.localeCompare(b.status), renderHeaderCell: () => "Situação", renderCell: (record) => <StatusBadge status={record.status === "active" ? "Ativa" : "Inativa"} /> }),
    createTableColumn({ columnId: "updated", compare: (a, b) => a.updatedAt.localeCompare(b.updatedAt), renderHeaderCell: () => "Atualizado em", renderCell: (record) => record.updatedAt }),
    createTableColumn({ columnId: "actions", renderHeaderCell: () => "Ações", renderCell: (record) => <div className="registration-grid__actions" onClick={(event) => event.stopPropagation()}><Tooltip content={`Visualizar matrícula ${record.number}`} relationship="label"><Button appearance="subtle" size="small" icon={<Eye20Regular />} aria-label={`Visualizar matrícula ${record.number}`} onClick={() => onView(record)} /></Tooltip><Menu positioning="below-end"><MenuTrigger disableButtonEnhancement><Button appearance="subtle" size="small" icon={<MoreHorizontal20Regular />} aria-label={`Mais ações para matrícula ${record.number}`} /></MenuTrigger><MenuPopover><MenuList><MenuItem icon={<Eye20Regular />} onClick={() => onView(record)}>Visualizar</MenuItem><MenuItem icon={<Edit20Regular />} onClick={() => onEdit(record)}>Editar</MenuItem><MenuItem icon={<People20Regular />} onClick={() => onManageOwners(record)}>Gerenciar proprietários</MenuItem><MenuItem icon={<PersonProhibited20Regular />} disabled={record.status === "inactive"} onClick={() => onInactivate(record)}>Inativar</MenuItem><MenuItem className="registration-menu-danger" icon={<Delete20Regular />} onClick={() => onDelete(record)}>Excluir</MenuItem></MenuList></MenuPopover></Menu></div> }),
  ], [onDelete, onEdit, onInactivate, onManageOwners, onView]);
  if (loading) return <Skeleton className="search-results-skeleton" aria-label="Carregando matrículas">{Array.from({ length: 10 }, (_, index) => <SkeletonItem key={index} shape="rectangle" size={40} />)}</Skeleton>;
  if (!records.length) return <RegistrationEmptyState filtered={filtered} onClear={onClear} onNew={onNew} />;
  return <><div className="data-grid-wrap registration-grid" aria-label="Lista de matrículas"><DataGrid items={records} columns={columns} size="small" sortable getRowId={(record) => record.id}><DataGridHeader><DataGridRow>{({ renderHeaderCell, columnId }) => <DataGridHeaderCell className={`registration-column--${String(columnId)}`}>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow></DataGridHeader><DataGridBody<RegistrationListItem>>{({ item, rowId }) => <DataGridRow<RegistrationListItem> key={rowId} onClick={() => onView(item)}>{({ renderCell, columnId }) => <DataGridCell className={`registration-column--${String(columnId)}`}>{renderCell(item)}</DataGridCell>}</DataGridRow>}</DataGridBody></DataGrid></div><nav className="consulta-pagination" aria-label="Paginação de matrículas"><Button appearance="subtle" size="small" icon={<ChevronLeft20Regular />} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</Button><div className="consulta-pagination__pages">{Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => <Button key={pageNumber} appearance={pageNumber === page ? "primary" : "subtle"} size="small" aria-current={pageNumber === page ? "page" : undefined} onClick={() => onPageChange(pageNumber)}>{pageNumber}</Button>)}</div><Button appearance="subtle" size="small" iconPosition="after" icon={<ChevronRight20Regular />} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Próxima</Button></nav></>;
}
