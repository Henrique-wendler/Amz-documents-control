import { Badge } from "@fluentui/react-components";
import {
  ArrowRight16Regular,
  Info24Regular,
  Warning24Regular,
} from "@fluentui/react-icons";
import type { DashboardAlert } from "../../types/dashboard";

interface AlertsPanelProps {
  items: DashboardAlert[];
  onSelect: (item: DashboardAlert) => void;
}

export function AlertsPanel({ items, onSelect }: AlertsPanelProps) {
  return (
    <div className="alerts-list">
      {items.map((item) => {
        const Icon = item.severity === "info" ? Info24Regular : Warning24Regular;
        const badgeColor = item.severity === "alert" ? "danger" : item.severity === "warning" ? "warning" : "informative";
        return (
          <button className="alert-row" type="button" key={item.id} onClick={() => onSelect(item)}>
            <span className={`alert-row__icon alert-row__icon--${item.severity}`} aria-hidden="true"><Icon /></span>
            <span className="alert-row__content">
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
            <Badge appearance="tint" color={badgeColor} size="small">{item.count}</Badge>
            <ArrowRight16Regular className="alert-row__arrow" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
