import { supabase } from "../lib/supabase";
import type { DocumentValidityStatus } from "../types/domain";
import type { PersistedOwner } from "./ownerRepository";
import type { PersistedFarm } from "./farmRepository";
import type { PersistedRegistration } from "./registrationRepository";
import type { PersistedOwnershipLink } from "./ownershipRepository";
import type { PersistedDocument } from "./documentRepository";
import type { PersistedCarRecord } from "./carRepository";
import type { GuaranteeItemRecord, GuaranteeRecord, GuaranteeTypeOption, OperationRecord } from "../types/operacao";
import { supabaseOwnerRepository } from "./supabaseOwnerRepository";
import { supabaseFarmRepository } from "./supabaseFarmRepository";
import { supabaseRegistrationRepository } from "./supabaseRegistrationRepository";
import { supabaseOwnershipRepository } from "./supabaseOwnershipRepository";
import { supabaseDocumentRepository } from "./supabaseDocumentRepository";
import { supabaseCarRepository } from "./supabaseCarRepository";
import { supabaseOperationRepository } from "./supabaseOperationRepository";
import { supabaseGuaranteeRepository } from "./supabaseGuaranteeRepository";

export interface DashboardAuditRecord {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: string;
  actorName: string;
}

export interface DashboardSnapshot {
  owners: PersistedOwner[];
  farms: PersistedFarm[];
  registrations: PersistedRegistration[];
  ownershipLinks: PersistedOwnershipLink[];
  documents: Array<PersistedDocument & { validityStatus: DocumentValidityStatus }>;
  cars: PersistedCarRecord[];
  operations: OperationRecord[];
  guarantees: GuaranteeRecord[];
  guaranteeTypes: GuaranteeTypeOption[];
  guaranteeItems: GuaranteeItemRecord[];
  audit: DashboardAuditRecord[];
}

export interface DashboardQueryAccess {
  readFinancial: boolean;
  readAudit: boolean;
}

interface AuditRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  created_at: string;
  actor_user_id: string | null;
}

const loadAudit = async (): Promise<DashboardAuditRecord[]> => {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, entity_type, entity_id, action, created_at, actor_user_id")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error("Não foi possível carregar as movimentações recentes.");
  const rows = (data ?? []) as unknown as AuditRow[];
  const actorIds = [...new Set(rows.map((row) => row.actor_user_id).filter((id): id is string => Boolean(id)))];
  const actorNames = new Map<string, string>();
  if (actorIds.length) {
    const profiles = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    if (!profiles.error) (profiles.data ?? []).forEach((profile) => actorNames.set(profile.id as string, profile.full_name as string));
  }
  return rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    createdAt: row.created_at,
    actorName: row.actor_user_id ? actorNames.get(row.actor_user_id) ?? "Usuário do sistema" : "Sistema",
  }));
};

export const dashboardQueryRepository = {
  async load(access: DashboardQueryAccess): Promise<DashboardSnapshot> {
    const [owners, farms, registrations, ownershipLinks, documents, cars, operations, guarantees, guaranteeTypes, guaranteeItems, audit] = await Promise.all([
      supabaseOwnerRepository.listAll(),
      supabaseFarmRepository.list(),
      supabaseRegistrationRepository.list(),
      supabaseOwnershipRepository.list(),
      supabaseDocumentRepository.list(),
      supabaseCarRepository.list(),
      supabaseOperationRepository.list(access.readFinancial),
      supabaseGuaranteeRepository.list(access.readFinancial),
      supabaseGuaranteeRepository.listTypes(true),
      access.readAudit ? supabaseGuaranteeRepository.listItems() : Promise.resolve([]),
      access.readAudit ? loadAudit() : Promise.resolve([]),
    ]);
    return { owners, farms, registrations, ownershipLinks, documents, cars, operations, guarantees, guaranteeTypes, guaranteeItems, audit };
  },
};
