import { Tooltip } from "@fluentui/react-components";

interface EntityChip {
  id: string;
  label: string;
  detail?: string;
}

export function EntityChips({ items }: { items: EntityChip[] }) {
  if (!items.length) return <span>—</span>;
  const visible = items.slice(0, 6);
  return <span className="entity-chips">
    {visible.map((item) => <Tooltip key={item.id} content={item.detail ?? item.label} relationship="description">
      <span className="entity-chip">{item.label}</span>
    </Tooltip>)}
    {items.length > visible.length ? <Tooltip content={items.slice(visible.length).map((item) => item.label).join(", ")} relationship="description">
      <span className="entity-chip entity-chip--more">+{items.length - visible.length}</span>
    </Tooltip> : null}
  </span>;
}
