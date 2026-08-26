import { Badge } from "@fluentui/react-components";
import {
  Building16Regular,
  Document16Regular,
  Folder16Regular,
  Money16Regular,
  People16Regular,
  Shield16Regular,
} from "@fluentui/react-icons";
import type { ComponentType } from "react";
import type { SearchEntityType } from "../../types/consulta";

export const entityLabels: Record<SearchEntityType, string> = {
  owner: "Proprietário",
  farm: "Fazenda",
  registration: "Matrícula",
  operation: "Operação",
  guarantee: "Garantia",
  document: "Documento",
  car: "CAR",
};

const icons: Record<SearchEntityType, ComponentType> = {
  owner: People16Regular,
  farm: Building16Regular,
  registration: Document16Regular,
  operation: Money16Regular,
  guarantee: Shield16Regular,
  document: Folder16Regular,
  car: Shield16Regular,
};

export function ResultTypeBadge({ type }: { type: SearchEntityType }) {
  const Icon = icons[type];
  return (
    <Badge className="result-type-badge" appearance="tint" color="success" icon={<Icon />} size="small">
      {entityLabels[type]}
    </Badge>
  );
}
