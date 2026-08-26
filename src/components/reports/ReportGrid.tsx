import { DataGrid, DataGridBody, DataGridCell, DataGridHeader, DataGridHeaderCell, DataGridRow, Skeleton, SkeletonItem, Tooltip, createTableColumn } from "@fluentui/react-components";
import type { TableColumnDefinition } from "@fluentui/react-components";
import { DocumentTable24Regular } from "@fluentui/react-icons";
import type { ReportColumn, ReportRow } from "../../types/report";
import { StatusBadge } from "../StatusBadge";

interface Props { columns: ReportColumn[]; rows: ReportRow[]; loading: boolean; }

export function ReportGrid({ columns, rows, loading }: Props) {
  if (loading) return <Skeleton className="report-grid__skeleton" aria-label="Gerando relatório">{Array.from({ length: 6 }, (_, index) => <SkeletonItem key={index} shape="rectangle" size={40} />)}</Skeleton>;
  if (!rows.length) return <div className="report-empty"><DocumentTable24Regular /><h3>Nenhum registro encontrado</h3><p>Ajuste os filtros e gere o relatório novamente.</p></div>;
  const definitions: TableColumnDefinition<ReportRow>[] = columns.map((column) => createTableColumn({ columnId: column.key, compare: (a, b) => a.values[column.key].localeCompare(b.values[column.key], "pt-BR"), renderHeaderCell: () => column.label, renderCell: (item) => column.key === "status" ? <StatusBadge status={item.values[column.key]} /> : <Tooltip content={item.values[column.key]} relationship="description"><span className={`report-cell${column.align === "end" ? " report-cell--end" : ""}`}>{item.values[column.key]}</span></Tooltip> }));
  return <div className="data-grid-wrap report-grid"><DataGrid items={rows} columns={definitions} size="small" sortable getRowId={(item) => item.id}><DataGridHeader><DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow></DataGridHeader><DataGridBody<ReportRow>>{({ item, rowId }) => <DataGridRow<ReportRow> key={rowId}>{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}</DataGridRow>}</DataGridBody></DataGrid></div>;
}
