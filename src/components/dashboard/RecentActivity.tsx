import {
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
import type { RecentActivityItem } from "../../types/dashboard";

const columns: TableColumnDefinition<RecentActivityItem>[] = [
  createTableColumn({ columnId: "dateTime", renderHeaderCell: () => "Data/Hora", renderCell: (item) => <TableCellLayout>{item.dateTime}</TableCellLayout> }),
  createTableColumn({ columnId: "action", renderHeaderCell: () => "Ação", renderCell: (item) => <TableCellLayout><strong>{item.action}</strong></TableCellLayout> }),
  createTableColumn({ columnId: "record", renderHeaderCell: () => "Registro", renderCell: (item) => <TableCellLayout>{item.record}</TableCellLayout> }),
  createTableColumn({ columnId: "user", renderHeaderCell: () => "Usuário", renderCell: (item) => <TableCellLayout>{item.user}</TableCellLayout> }),
];

export function RecentActivity({ items }: { items: RecentActivityItem[] }) {
  return (
    <div className="data-grid-wrap dashboard-table dashboard-table--activity" aria-label="Movimentações recentes">
      <DataGrid items={items} columns={columns} size="small" getRowId={(item) => item.id}>
        <DataGridHeader>
          <DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow>
        </DataGridHeader>
        <DataGridBody<RecentActivityItem>>
          {({ item, rowId }) => (
            <DataGridRow<RecentActivityItem> key={rowId}>{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}</DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
    </div>
  );
}
