import type { Operation } from "../../../types/domain";

export const operationSeeds: Operation[] = [
  { id: "OP-001", farmId: "FARM-001", registrationId: "REG-001", number: "OP-2026-001", bank: "Banco do Brasil", purpose: "Investimento rural", value: 100000, status: "under_review", startDate: "2026-08-18", createdAt: "2026-08-18", updatedAt: "2026-08-24" },
  { id: "OP-002", farmId: "FARM-002", registrationId: "REG-003", number: "OP-2026-002", bank: "Banco da Amazônia", purpose: "Custeio agrícola", value: 780000, status: "active", startDate: "2026-08-11", createdAt: "2026-08-11", updatedAt: "2026-08-23" },
  { id: "OP-003", farmId: "FARM-003", registrationId: "REG-005", number: "OP-2026-003", bank: "Sicredi", purpose: "Máquinas e equipamentos", value: 450000, status: "active", startDate: "2026-08-08", createdAt: "2026-08-08", updatedAt: "2026-08-22" },
  { id: "OP-004", farmId: "FARM-001", registrationId: "REG-002", number: "OP-2026-004", bank: "Bradesco", purpose: "Custeio pecuário", value: 320000, status: "active", startDate: "2026-08-04", createdAt: "2026-08-04", updatedAt: "2026-08-21" },
  { id: "OP-005", farmId: "FARM-004", registrationId: "REG-007", number: "OP-2026-005", bank: "Banco do Brasil", purpose: "Expansão de área", value: 1200000, status: "under_review", startDate: "2026-07-30", createdAt: "2026-07-30", updatedAt: "2026-08-20" },
  { id: "OP-006", farmId: "FARM-005", registrationId: "REG-009", number: "OP-2026-006", bank: "Caixa Econômica", purpose: "Regularização fundiária", value: 280000, status: "cancelled", startDate: "2026-07-24", createdAt: "2026-07-24", updatedAt: "2026-08-19" },
  { id: "OP-007", farmId: "FARM-006", registrationId: "REG-011", number: "OP-2026-007", bank: "Sicredi", purpose: "Custeio agrícola", value: 610000, status: "completed", startDate: "2026-07-18", createdAt: "2026-07-18", updatedAt: "2026-08-18" },
  { id: "OP-008", farmId: "FARM-002", registrationId: "REG-004", number: "OP-2026-008", bank: "Banco do Brasil", purpose: "Armazenagem", value: 890000, status: "active", startDate: "2026-07-12", createdAt: "2026-07-12", updatedAt: "2026-08-17" },
];

