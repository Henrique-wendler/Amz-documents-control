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
import type { GuaranteeFormModel } from "../types/models";
import { StatusBadge } from "./StatusBadge";

interface GuaranteeGridProps {
  items: GuaranteeFormModel[];
  selectedId?: string;
  onSelect: (item: GuaranteeFormModel) => void;
}

const dateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

const columns: TableColumnDefinition<GuaranteeFormModel>[] = [
  createTableColumn({ columnId: "numero", renderHeaderCell: () => "Número", renderCell: (item) => item.numeroOperacao }),
  createTableColumn({ columnId: "matricula", renderHeaderCell: () => "Matrícula", renderCell: (item) => item.matricula }),
  createTableColumn({ columnId: "fazenda", renderHeaderCell: () => "Fazenda", renderCell: (item) => item.fazenda }),
  createTableColumn({ columnId: "banco", renderHeaderCell: () => "Banco", renderCell: (item) => item.banco }),
  createTableColumn({ columnId: "tipo", renderHeaderCell: () => "Tipo", renderCell: (item) => item.tipo }),
  createTableColumn({ columnId: "valor", renderHeaderCell: () => "Valor", renderCell: (item) => item.valor }),
  createTableColumn({ columnId: "situacao", renderHeaderCell: () => "Situação", renderCell: (item) => <StatusBadge status={item.situacao} /> }),
  createTableColumn({ columnId: "vencimento", renderHeaderCell: () => "Vencimento", renderCell: (item) => dateLabel(item.dataVencimento) }),
];

export function GuaranteeGrid({ items, selectedId, onSelect }: GuaranteeGridProps) {
  const selectedItems = new Set<TableRowId>(selectedId ? [selectedId] : []);

  return (
    <div className="data-grid-wrap" aria-label="Garantias cadastradas">
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
        <DataGridBody<GuaranteeFormModel>>
          {({ item, rowId }) => (
            <DataGridRow<GuaranteeFormModel> key={rowId} onClick={() => onSelect(item)}>
              {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
            </DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
    </div>
  );
}
