import {
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  createTableColumn,
  type TableColumnDefinition,
  type TableRowId,
} from "@fluentui/react-components";
import type { GuaranteeItemFormModel } from "../types/models";

interface GuaranteeItemGridProps {
  items: GuaranteeItemFormModel[];
  selectedId?: string;
  onSelect: (item: GuaranteeItemFormModel) => void;
}

const columns: TableColumnDefinition<GuaranteeItemFormModel>[] = [
  createTableColumn({ columnId: "categoria", renderHeaderCell: () => "Categoria", renderCell: (item) => item.categoria }),
  createTableColumn({ columnId: "descricao", renderHeaderCell: () => "Descrição", renderCell: (item) => item.descricao }),
  createTableColumn({ columnId: "quantidade", renderHeaderCell: () => "Quantidade", renderCell: (item) => item.quantidade }),
  createTableColumn({ columnId: "unidade", renderHeaderCell: () => "Unidade", renderCell: (item) => item.unidade }),
];

export function GuaranteeItemGrid({ items, selectedId, onSelect }: GuaranteeItemGridProps) {
  const selectedItems = new Set<TableRowId>(selectedId ? [selectedId] : []);

  return (
    <div className="data-grid-wrap" aria-label="Itens da garantia">
      <DataGrid
        items={items}
        columns={columns}
        getRowId={(item) => item.id}
        selectionMode="single"
        selectedItems={selectedItems}
        onSelectionChange={(_, data) => {
          const id = Array.from(data.selectedItems)[0];
          const selected = items.find((item) => item.id === id);
          if (selected) onSelect(selected);
        }}
        focusMode="composite"
        size="small"
      >
        <DataGridHeader>
          <DataGridRow>
            {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
          </DataGridRow>
        </DataGridHeader>
        <DataGridBody<GuaranteeItemFormModel>>
          {({ item, rowId }) => (
            <DataGridRow<GuaranteeItemFormModel> key={rowId} onClick={() => onSelect(item)}>
              {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
            </DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
    </div>
  );
}
