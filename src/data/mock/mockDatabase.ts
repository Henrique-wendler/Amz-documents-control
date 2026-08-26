import type { MockDatabase } from "../../types/domain";
import { activitySeeds } from "./seeds/activities";
import { carRecordSeeds } from "./seeds/carRecords";
import { documentSeeds } from "./seeds/documents";
import { farmSeeds } from "./seeds/farms";
import { guaranteeItemSeeds } from "./seeds/guaranteeItems";
import { guaranteeSeeds } from "./seeds/guarantees";
import { operationSeeds } from "./seeds/operations";
import { ownerSeeds } from "./seeds/owners";
import { ownershipLinkSeeds } from "./seeds/ownershipLinks";
import { registrationSeeds } from "./seeds/registrations";

export const mockDatabaseSeed: MockDatabase = {
  owners: ownerSeeds,
  farms: farmSeeds,
  registrations: registrationSeeds,
  ownershipLinks: ownershipLinkSeeds,
  operations: operationSeeds,
  guarantees: guaranteeSeeds,
  guaranteeItems: guaranteeItemSeeds,
  documents: documentSeeds,
  carRecords: carRecordSeeds,
  activities: activitySeeds,
};

export const createMockDatabase = (): MockDatabase => structuredClone(mockDatabaseSeed);

