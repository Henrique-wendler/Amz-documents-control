import type { CarRecord } from "../../../types/domain";

export const carRecordSeeds: CarRecord[] = [
  { id: "CAR-001", farmId: "FARM-001", registrationId: "REG-001", ownerId: "OWN-001", number: "TO-1700000-A1B2C3D4", receiptNumber: "CAR-2026-001", status: "active", createdAt: "2024-02-15", updatedAt: "2026-08-22" },
  { id: "CAR-002", farmId: "FARM-002", registrationId: "REG-003", ownerId: "OWN-002", number: "TO-1718204-B2C3D4E5", receiptNumber: "CAR-2026-002", status: "active", createdAt: "2024-03-10", updatedAt: "2026-08-21" },
  { id: "CAR-003", farmId: "FARM-003", registrationId: "REG-005", ownerId: "OWN-003", number: "TO-1709500-C3D4E5F6", receiptNumber: "CAR-2026-003", status: "active", createdAt: "2024-03-22", updatedAt: "2026-08-20" },
  { id: "CAR-004", farmId: "FARM-004", registrationId: "REG-007", ownerId: "OWN-004", number: "TO-1716109-D4E5F6G7", receiptNumber: "CAR-2026-004", status: "pending", createdAt: "2024-04-08", updatedAt: "2026-08-19" },
  { id: "CAR-005", farmId: "FARM-005", registrationId: "REG-009", ownerId: "OWN-005", number: "TO-1702109-E5F6G7H8", receiptNumber: "CAR-2026-005", status: "active", createdAt: "2024-04-20", updatedAt: "2026-08-18" },
];

