import type { Activity } from "../../../types/domain";

export const activitySeeds: Activity[] = [
  { id: "ACT-001", entityType: "guarantee", entityId: "GAR-001", action: "Garantia atualizada", userName: "Carlos", createdAt: "2026-08-24T15:42:00" },
  { id: "ACT-002", entityType: "document", entityId: "DOC-002", action: "Documento cadastrado", userName: "Mariana", createdAt: "2026-08-24T14:18:00" },
  { id: "ACT-003", entityType: "farm", entityId: "FARM-001", action: "Fazenda atualizada", userName: "Carlos", createdAt: "2026-08-24T11:03:00" },
  { id: "ACT-004", entityType: "operation", entityId: "OP-004", action: "Operação cadastrada", userName: "Ana", createdAt: "2026-08-23T16:40:00" },
];

