import type { ApprovalStatus } from "../types/proposalTracking";
export const approvalLabels: Record<ApprovalStatus, string> = {
  pending: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
};
export const trackingDate = (value: string) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Araguaina",
      }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value))
    : "—";
// SQL returns NUMERIC as decimal text. Preserve cents even for totals above Number's safe range.
export const trackingCurrency = (value: string | null | undefined) => {
  if (value == null || !/^\d+(\.\d{1,2})?$/.test(value)) return "Não informado";
  const [integer, fraction = ""] = value.split(".");
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .formatToParts(BigInt(integer))
    .map((part) =>
      part.type === "fraction" ? fraction.padEnd(2, "0") : part.value,
    )
    .join("");
};
export const trackingDays = (value: number) =>
  `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)} dias`;
