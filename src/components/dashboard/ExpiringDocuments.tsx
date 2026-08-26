import {
  Badge,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  TableCellLayout,
  createTableColumn,
} from "@fluentui/react-components";
import type { TableColumnDefinition } from "@fluentui/react-components";
import type { ExpiringDocument } from "../../types/dashboard";

const columns: TableColumnDefinition<ExpiringDocument>[] = [
  createTableColumn({ columnId: "document", renderHeaderCell: () => "Documento", renderCell: (item) => <TableCellLayout>{item.document}</TableCellLayout> }),
  createTableColumn({ columnId: "farm", renderHeaderCell: () => "Fazenda", renderCell: (item) => <TableCellLayout>{item.farm}</TableCellLayout> }),
  createTableColumn({ columnId: "registry", renderHeaderCell: () => "Matrícula", renderCell: (item) => <TableCellLayout>{item.registry}</TableCellLayout> }),
  createTableColumn({ columnId: "expiresAt", renderHeaderCell: () => "Vencimento", renderCell: (item) => <TableCellLayout>{item.expiresAt}</TableCellLayout> }),
  createTableColumn({
    columnId: "status",
    renderHeaderCell: () => "Status",
    renderCell: (item) => (
      <TableCellLayout>
        <Badge appearance="tint" color={item.daysRemaining <= 12 ? "danger" : "warning"} size="small">
          {item.daysRemaining} dias
        </Badge>
      </TableCellLayout>
    ),
  }),
];

export function ExpiringDocuments({ items }: { items: ExpiringDocument[] }) {
  return (
    <div className="data-grid-wrap dashboard-table" aria-label="Documentos próximos do vencimento">
      <DataGrid items={items} columns={columns} size="small" getRowId={(item) => item.id}>
        <DataGridHeader>
          <DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow>
        </DataGridHeader>
        <DataGridBody<ExpiringDocument>>
          {({ item, rowId }) => (
            <DataGridRow<ExpiringDocument> key={rowId}>{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}</DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
    </div>
  );
}
