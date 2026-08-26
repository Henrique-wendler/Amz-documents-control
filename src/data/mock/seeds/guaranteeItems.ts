import type { GuaranteeItem } from "../../../types/domain";

export const guaranteeItemSeeds: GuaranteeItem[] = [
  { id: "GITEM-001", guaranteeId: "GAR-001", category: "Animal", description: "Bovinos Nelore", quantity: 120, unit: "Cabeças", notes: "Lote vinculado à garantia", createdAt: "2026-07-24", updatedAt: "2026-08-23" },
  { id: "GITEM-002", guaranteeId: "GAR-002", category: "Imóvel", description: "Área rural hipotecada", quantity: 1680, unit: "ha", createdAt: "2026-08-11", updatedAt: "2026-08-22" },
  { id: "GITEM-003", guaranteeId: "GAR-003", category: "Produção agrícola", description: "Soja safra 2026/2027", quantity: 9000, unit: "Saca", createdAt: "2026-08-08", updatedAt: "2026-08-21" },
  { id: "GITEM-004", guaranteeId: "GAR-004", category: "Máquina", description: "Trator agrícola", quantity: 2, unit: "Unidade", createdAt: "2026-08-04", updatedAt: "2026-08-20" },
  { id: "GITEM-005", guaranteeId: "GAR-005", category: "Imóvel", description: "Área rural hipotecada", quantity: 2100, unit: "ha", createdAt: "2026-07-30", updatedAt: "2026-08-19" },
  { id: "GITEM-006", guaranteeId: "GAR-006", category: "Outro", description: "Aval de terceiros", quantity: 1, unit: "Unidade", createdAt: "2026-07-24", updatedAt: "2026-08-18" },
  { id: "GITEM-007", guaranteeId: "GAR-007", category: "Produção agrícola", description: "Milho safra 2025/2026", quantity: 7000, unit: "Saca", createdAt: "2025-07-18", updatedAt: "2026-08-17" },
  { id: "GITEM-008", guaranteeId: "GAR-008", category: "Equipamento", description: "Sistema de armazenagem", quantity: 1, unit: "Unidade", createdAt: "2026-07-12", updatedAt: "2026-08-16" },
];

