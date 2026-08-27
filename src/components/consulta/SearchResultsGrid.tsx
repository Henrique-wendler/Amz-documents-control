import { useMemo } from "react";
import {
  Button,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Skeleton,
  SkeletonItem,
  Tooltip,
  createTableColumn,
} from "@fluentui/react-components";
import type { TableColumnDefinition } from "@fluentui/react-components";
import { ChevronLeft20Regular, ChevronRight20Regular, Eye20Regular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import type { SearchCategory, SearchRecord } from "../../types/consulta";
import { StatusBadge } from "../StatusBadge";
import { ResultTypeBadge } from "./ResultTypeBadge";
import { SearchEmptyState } from "./SearchEmptyState";

interface SearchResultsGridProps {
  records: SearchRecord[];
  category: SearchCategory;
  loading: boolean;
  selectedId?: string;
  page: number;
  totalPages: number;
  onSelect: (record: SearchRecord) => void;
  onPageChange: (page: number) => void;
  onClear: () => void;
}

interface ColumnSpec {
  id: string;
  label: string;
  value: (record: SearchRecord) => string;
  render?: (record: SearchRecord) => ReactNode;
  secondary?: boolean;
}

const textCell = (value: string, strong = false) => (
  <Tooltip content={value} relationship="description">
    <span className={`search-cell-text${strong ? " search-cell-text--strong" : ""}`}>{value}</span>
  </Tooltip>
);

const attribute = (key: string) => (record: SearchRecord) => record.attributes[key] ?? "—";

const actionColumn: ColumnSpec = {
  id: "actions",
  label: "Ações",
  value: (record) => record.title,
  render: (record) => (
    <Tooltip content={`Ver detalhes de ${record.title}`} relationship="label">
      <Button appearance="subtle" size="small" icon={<Eye20Regular />} aria-label={`Ver detalhes de ${record.title}`} />
    </Tooltip>
  ),
};

const commonColumns: ColumnSpec[] = [
  { id: "type", label: "Tipo", value: (record) => record.entityType, render: (record) => <ResultTypeBadge type={record.entityType} /> },
  { id: "title", label: "Registro", value: (record) => record.title, render: (record) => textCell(record.title, true) },
  { id: "reference", label: "Referência", value: (record) => record.reference, render: (record) => textCell(record.reference) },
  { id: "details", label: "Detalhes", value: (record) => record.details, render: (record) => textCell(record.details), secondary: true },
  { id: "status", label: "Situação", value: (record) => record.status, render: (record) => <StatusBadge status={record.status} /> },
  { id: "updatedAt", label: "Atualizado em", value: (record) => record.updatedAt, secondary: true },
  actionColumn,
];

const categoryColumns: Record<Exclude<SearchCategory, "all">, ColumnSpec[]> = {
  owner: [
    { id: "title", label: "Nome", value: (record) => record.title, render: (record) => textCell(record.title, true) },
    { id: "document", label: "CPF/CNPJ", value: attribute("document") },
    { id: "ownerType", label: "Tipo", value: attribute("ownerType") },
    { id: "phone", label: "Telefone", value: attribute("phone") },
    { id: "email", label: "E-mail", value: attribute("email"), render: (record) => textCell(record.attributes.email ?? "—"), secondary: true },
    { id: "status", label: "Situação", value: (record) => record.status, render: (record) => <StatusBadge status={record.status} /> },
    actionColumn,
  ],
  farm: [
    { id: "title", label: "Fazenda", value: (record) => record.title, render: (record) => textCell(record.title, true) },
    { id: "reference", label: "Município/UF", value: (record) => record.reference },
    { id: "owner", label: "Proprietário principal", value: attribute("owner"), render: (record) => textCell(record.attributes.owner ?? "—") },
    { id: "area", label: "Área total", value: attribute("area") },
    { id: "status", label: "Situação", value: (record) => record.status, render: (record) => <StatusBadge status={record.status} /> },
    actionColumn,
  ],
  registration: [
    { id: "title", label: "Matrícula", value: (record) => record.title, render: (record) => textCell(record.title, true) },
    { id: "farm", label: "Fazenda", value: attribute("farm"), render: (record) => textCell(record.attributes.farm ?? "—") },
    { id: "legalArea", label: "Área legal", value: attribute("legalArea") },
    { id: "hp", label: "HP", value: attribute("hp") },
    { id: "certificateDate", label: "Data da certidão", value: attribute("certificateDate"), secondary: true },
    { id: "status", label: "Situação", value: (record) => record.status, render: (record) => <StatusBadge status={record.status} /> },
    actionColumn,
  ],
  operation: [
    { id: "title", label: "Número", value: (record) => record.title, render: (record) => textCell(record.title, true) },
    { id: "farm", label: "Fazenda", value: attribute("farm"), render: (record) => textCell(record.attributes.farm ?? "—") },
    { id: "bank", label: "Banco", value: attribute("bank") },
    { id: "purpose", label: "Finalidade", value: attribute("purpose"), secondary: true },
    { id: "value", label: "Valor", value: attribute("value") },
    { id: "status", label: "Situação", value: (record) => record.status, render: (record) => <StatusBadge status={record.status} /> },
    { id: "startDate", label: "Data de início", value: attribute("startDate"), secondary: true },
    actionColumn,
  ],
  guarantee: [
    { id: "title", label: "Tipo", value: (record) => record.title, render: (record) => textCell(record.title, true) },
    { id: "operation", label: "Operação", value: attribute("operation") },
    { id: "registration", label: "Matrícula", value: attribute("registration") },
    { id: "bank", label: "Banco", value: attribute("bank"), secondary: true },
    { id: "value", label: "Valor", value: attribute("value") },
    { id: "status", label: "Situação", value: (record) => record.status, render: (record) => <StatusBadge status={record.status} /> },
    { id: "expiresAt", label: "Vencimento", value: attribute("expiresAt"), secondary: true },
    actionColumn,
  ],
  document: [
    { id: "title", label: "Documento", value: (record) => record.title, render: (record) => textCell(record.title, true) },
    { id: "number", label: "Número", value: attribute("number") },
    { id: "farm", label: "Fazenda", value: attribute("farm"), render: (record) => textCell(record.attributes.farm ?? "—") },
    { id: "issuedAt", label: "Emissão", value: attribute("issuedAt"), secondary: true },
    { id: "validUntil", label: "Validade", value: attribute("validUntil") },
    { id: "status", label: "Situação", value: (record) => record.status, render: (record) => <StatusBadge status={record.status} /> },
    actionColumn,
  ],
  car: [
    { id: "title", label: "Número CAR", value: (record) => record.title, render: (record) => textCell(record.title, true) },
    { id: "farm", label: "Fazenda", value: attribute("farm"), render: (record) => textCell(record.attributes.farm ?? "—") },
    { id: "owner", label: "Proprietário", value: attribute("owner"), render: (record) => textCell(record.attributes.owner ?? "—"), secondary: true },
    { id: "receipt", label: "Número do recibo", value: attribute("receipt") },
    { id: "status", label: "Situação", value: (record) => record.status, render: (record) => <StatusBadge status={record.status} /> },
    actionColumn,
  ],
};

export function SearchResultsGrid({
  records,
  category,
  loading,
  page,
  totalPages,
  onSelect,
  onPageChange,
  onClear,
}: SearchResultsGridProps) {
  const specs = category === "all" ? commonColumns : categoryColumns[category];
  const specMap = useMemo(() => new Map(specs.map((spec) => [spec.id, spec])), [specs]);
  const columns: TableColumnDefinition<SearchRecord>[] = useMemo(
    () => specs.map((spec) => createTableColumn<SearchRecord>({
      columnId: spec.id,
      compare: (left, right) => spec.value(left).localeCompare(spec.value(right), "pt-BR"),
      renderHeaderCell: () => spec.label,
      renderCell: (record) => spec.render ? spec.render(record) : textCell(spec.value(record)),
    })),
    [specs],
  );

  if (loading) {
    return (
      <Skeleton className="search-results-skeleton" aria-label="Carregando resultados">
        {Array.from({ length: 7 }, (_, index) => <SkeletonItem key={index} shape="rectangle" size={40} />)}
      </Skeleton>
    );
  }

  if (!records.length) return <SearchEmptyState onClear={onClear} />;

  return (
    <>
      <div className="data-grid-wrap search-results-grid" aria-label="Resultados da consulta">
        <DataGrid
          items={records}
          columns={columns}
          size="small"
          sortable
          getRowId={(record) => record.id}
        >
          <DataGridHeader>
            <DataGridRow>
              {({ renderHeaderCell, columnId }) => (
                <DataGridHeaderCell className={specMap.get(String(columnId))?.secondary ? "search-column--secondary" : ""}>
                  {renderHeaderCell()}
                </DataGridHeaderCell>
              )}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<SearchRecord>>
            {({ item, rowId }) => (
              <DataGridRow<SearchRecord> key={rowId} onClick={() => onSelect(item)}>
                {({ renderCell, columnId }) => (
                  <DataGridCell className={specMap.get(String(columnId))?.secondary ? "search-column--secondary" : ""}>
                    {renderCell(item)}
                  </DataGridCell>
                )}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      </div>

      <nav className="consulta-pagination" aria-label="Paginação dos resultados">
        <Button appearance="subtle" size="small" icon={<ChevronLeft20Regular />} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Anterior
        </Button>
        <div className="consulta-pagination__pages">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <Button
              appearance={pageNumber === page ? "primary" : "subtle"}
              size="small"
              key={pageNumber}
              aria-current={pageNumber === page ? "page" : undefined}
              onClick={() => onPageChange(pageNumber)}
            >
              {pageNumber}
            </Button>
          ))}
        </div>
        <Button appearance="subtle" size="small" iconPosition="after" icon={<ChevronRight20Regular />} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Próxima
        </Button>
      </nav>
    </>
  );
}
