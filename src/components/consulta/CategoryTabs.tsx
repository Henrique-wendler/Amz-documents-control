import { Tab, TabList } from "@fluentui/react-components";
import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import type { SearchCategory, SearchCounts } from "../../types/consulta";

interface CategoryTabsProps {
  value: SearchCategory;
  counts?: SearchCounts;
  onChange: (value: SearchCategory) => void;
}

const categories: Array<{ value: SearchCategory; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "owner", label: "Proprietários" },
  { value: "farm", label: "Fazendas" },
  { value: "registration", label: "Matrículas" },
  { value: "operation", label: "Operações" },
  { value: "guarantee", label: "Garantias" },
  { value: "document", label: "Documentos" },
  { value: "car", label: "CAR" },
];

export function CategoryTabs({ value, counts, onChange }: CategoryTabsProps) {
  const handleSelect = (_: SelectTabEvent, data: SelectTabData) => onChange(data.value as SearchCategory);
  return (
    <div className="consulta-category-tabs">
      <TabList selectedValue={value} onTabSelect={handleSelect} size="small">
        {categories.map((category) => (
          <Tab value={category.value} key={category.value}>
            <span>{category.label}</span>
            {counts ? <span className="consulta-category-count">{counts[category.value]}</span> : null}
          </Tab>
        ))}
      </TabList>
    </div>
  );
}
