import type { RuralDocument } from "../../../types/domain";

export const documentSeeds: RuralDocument[] = [
  { id: "DOC-001", farmId: "FARM-001", registrationId: "REG-001", type: "Licença Ambiental", number: "LA-2024-0098", issueDate: "2024-09-02", expirationDate: "2026-09-02", status: "active", purpose: "Regularização ambiental da atividade rural", licensedArea: 842.5, cab: "CAB-2024-0098", sigamStatus: "Deferida", notes: "Renovação programada antes do vencimento.", createdAt: "2024-09-02", updatedAt: "2026-08-24" },
  { id: "DOC-002", farmId: "FARM-001", registrationId: "REG-001", type: "Certidão de Inteiro Teor", number: "CIT-1111-26", issueDate: "2026-08-15", expirationDate: "2027-08-15", status: "active", createdAt: "2026-08-15", updatedAt: "2026-08-23" },
  { id: "DOC-003", farmId: "FARM-002", registrationId: "REG-003", type: "Certidão Negativa", number: "CN-2045-26", issueDate: "2026-03-09", expirationDate: "2026-09-09", status: "active", createdAt: "2026-03-09", updatedAt: "2026-08-22" },
  { id: "DOC-004", farmId: "FARM-002", registrationId: "REG-004", type: "ITR 2026", number: "ITR-2046-26", issueDate: "2026-08-20", expirationDate: "2026-12-31", status: "active", exercise: "2026", createdAt: "2026-08-20", updatedAt: "2026-08-21" },
  { id: "DOC-005", farmId: "FARM-003", registrationId: "REG-005", type: "ITR 2026", number: "ITR-3010-26", issueDate: "2026-08-17", expirationDate: "2026-09-17", status: "active", exercise: "2026", createdAt: "2026-08-17", updatedAt: "2026-08-20" },
  { id: "DOC-006", farmId: "FARM-003", registrationId: "REG-006", type: "CCIR", number: "CCIR-3011-26", issueDate: "2026-08-10", expirationDate: "2026-12-31", status: "active", createdAt: "2026-08-10", updatedAt: "2026-08-19" },
  { id: "DOC-007", farmId: "FARM-004", registrationId: "REG-007", type: "Licença de Operação", number: "LO-4020-25", issueDate: "2025-10-12", expirationDate: "2026-10-12", status: "active", createdAt: "2025-10-12", updatedAt: "2026-08-18" },
  { id: "DOC-008", farmId: "FARM-005", registrationId: "REG-009", type: "Certidão Ambiental", number: "CA-5100-24", issueDate: "2024-08-05", expirationDate: "2026-08-05", status: "active", createdAt: "2024-08-05", updatedAt: "2026-08-17" },
  { id: "DOC-009", farmId: "FARM-006", registrationId: "REG-011", type: "CCIR", number: "CCIR-6200-25", issueDate: "2025-07-18", expirationDate: "2026-07-18", status: "active", createdAt: "2025-07-18", updatedAt: "2026-08-16" },
  { id: "DOC-010", farmId: "FARM-006", type: "ITR 2026", number: "ITR-6201-26", issueDate: "2026-08-21", expirationDate: "2026-12-31", status: "active", exercise: "2026", createdAt: "2026-08-21", updatedAt: "2026-08-15" },
];
