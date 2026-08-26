import { Badge } from "@fluentui/react-components";

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color =
    status === "Ativa" || status === "Ativo" || status === "Vigente"
      ? "success"
      : status === "Em análise" || status === "A vencer"
        ? "warning"
        : status === "Cancelada" || status === "Vencido"
          ? "danger"
          : "subtle";

  return (
    <Badge appearance="tint" color={color} size="small">
      {status}
    </Badge>
  );
}
