import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type {
  OwnerRepository,
  OwnerRepositoryFilters,
  OwnerRepositoryInput,
  OwnerRepositoryPage,
  PersistedOwner,
} from "./ownerRepository";
import { OwnerConcurrencyError } from "./ownerRepository";

interface OwnerRow {
  id: string;
  owner_type: "individual" | "company";
  name: string;
  document_number: string;
  phone: string | null;
  email: string | null;
  status: "active" | "inactive";
  notes: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

const duplicateMessage = "Já existe um proprietário cadastrado com este CPF/CNPJ.";
const permissionMessage = "Você não possui permissão para realizar esta ação.";
const unavailableMessage = "Não foi possível acessar os proprietários no momento.";

const formatDocument = (value: string) => value.length === 11
  ? value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
  : value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

const formatTimestamp = (value: string) => new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Araguaina",
}).format(new Date(value));

const mapRow = (row: OwnerRow): PersistedOwner => ({
  id: row.id,
  type: row.owner_type,
  name: row.name,
  document: formatDocument(row.document_number),
  phone: row.phone ?? undefined,
  email: row.email ?? undefined,
  status: row.status,
  notes: row.notes ?? undefined,
  createdAt: formatTimestamp(row.created_at),
  updatedAt: formatTimestamp(row.updated_at),
  version: row.version,
});

const mapInput = (input: OwnerRepositoryInput) => ({
  owner_type: input.type,
  name: input.name,
  document_number: input.documentNumber,
  phone: input.phone || null,
  email: input.email || null,
  status: input.status,
  notes: input.notes || null,
});

const friendlyError = (error: PostgrestError, fallback = unavailableMessage) => {
  if (error.code === "23505") return new Error(duplicateMessage);
  if (error.code === "42501") return new Error(permissionMessage);
  if (error.code === "40001") return new OwnerConcurrencyError();
  return new Error(fallback);
};

const currentOrganizationId = async () => {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Sua sessão não pôde ser validada. Entre novamente.");

  const { data, error } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data?.organization_id) throw new Error("Seu usuário não possui um perfil ativo para acessar o sistema.");
  return data.organization_id as string;
};

const sanitizeSearch = (value: string) => value.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();

export const supabaseOwnerRepository: OwnerRepository = {
  async list(filters: OwnerRepositoryFilters): Promise<OwnerRepositoryPage> {
    const [allOwners, individuals, companies, inactive] = await Promise.all([
      supabase.from("owners").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("owners").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("owner_type", "individual"),
      supabase.from("owners").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("owner_type", "company"),
      supabase.from("owners").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "inactive"),
    ]);
    const summaryError = [allOwners, individuals, companies, inactive].find((result) => result.error)?.error;
    if (summaryError) throw friendlyError(summaryError);
    const summary = {
      total: allOwners.count ?? 0,
      individuals: individuals.count ?? 0,
      companies: companies.count ?? 0,
      inactive: inactive.count ?? 0,
    };

    let countQuery = supabase
      .from("owners")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    let recordsQuery = supabase
      .from("owners")
      .select("id, owner_type, name, document_number, phone, email, status, notes, created_at, updated_at, version")
      .is("deleted_at", null);

    if (filters.ownerIds) {
      if (!filters.ownerIds.length) {
        return { records: [], total: 0, page: 1, pageSize: filters.pageSize, totalPages: 1, summary };
      }
      countQuery = countQuery.in("id", filters.ownerIds);
      recordsQuery = recordsQuery.in("id", filters.ownerIds);
    }

    const search = sanitizeSearch(filters.query);
    if (search) {
      const documentSearch = filters.query.replace(/\D/g, "");
      const expression = [
        `name.ilike.%${search}%`,
        `phone.ilike.%${search}%`,
        `email.ilike.%${search}%`,
        documentSearch ? `document_number.ilike.%${documentSearch}%` : `document_number.ilike.%${search}%`,
      ].join(",");
      countQuery = countQuery.or(expression);
      recordsQuery = recordsQuery.or(expression);
    }
    if (filters.type !== "all") {
      countQuery = countQuery.eq("owner_type", filters.type);
      recordsQuery = recordsQuery.eq("owner_type", filters.type);
    }
    if (filters.status !== "all") {
      countQuery = countQuery.eq("status", filters.status);
      recordsQuery = recordsQuery.eq("status", filters.status);
    }

    const { count, error: countError } = await countQuery;
    if (countError) throw friendlyError(countError);
    const total = count ?? 0;
    const totalPages = Math.max(Math.ceil(total / filters.pageSize), 1);
    const page = Math.min(filters.page, totalPages);
    const start = (page - 1) * filters.pageSize;
    const { data, error } = await recordsQuery
      .order("name", { ascending: true })
      .range(start, start + filters.pageSize - 1);
    if (error) throw friendlyError(error);

    return {
      records: ((data ?? []) as OwnerRow[]).map(mapRow),
      total,
      page,
      pageSize: filters.pageSize,
      totalPages,
      summary,
    };
  },

  async listAll() {
    const records: PersistedOwner[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .from("owners")
        .select("id, owner_type, name, document_number, phone, email, status, notes, created_at, updated_at, version")
        .is("deleted_at", null)
        .order("name")
        .range(offset, offset + 499);
      if (error) throw friendlyError(error);
      const batch = ((data ?? []) as OwnerRow[]).map(mapRow);
      records.push(...batch);
      if (batch.length < 500) return records;
    }
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("owners")
      .select("id, owner_type, name, document_number, phone, email, status, notes, created_at, updated_at, version")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw friendlyError(error);
    return data ? mapRow(data as OwnerRow) : undefined;
  },

  async create(input: OwnerRepositoryInput) {
    const organizationId = await currentOrganizationId();
    const { data, error } = await supabase
      .from("owners")
      .insert({ organization_id: organizationId, ...mapInput(input) })
      .select("id, owner_type, name, document_number, phone, email, status, notes, created_at, updated_at, version")
      .single();
    if (error) throw friendlyError(error, "Não foi possível cadastrar o proprietário.");
    return mapRow(data as OwnerRow);
  },

  async update(id: string, expectedVersion: number, input: OwnerRepositoryInput) {
    const { data, error } = await supabase
      .from("owners")
      .update(mapInput(input))
      .eq("id", id)
      .eq("version", expectedVersion)
      .is("deleted_at", null)
      .select("id, owner_type, name, document_number, phone, email, status, notes, created_at, updated_at, version")
      .maybeSingle();
    if (error) throw friendlyError(error, "Não foi possível atualizar o proprietário.");
    if (!data) throw new OwnerConcurrencyError();
    return mapRow(data as OwnerRow);
  },

  async inactivate(id: string, expectedVersion: number) {
    const { data, error } = await supabase
      .from("owners")
      .update({ status: "inactive" })
      .eq("id", id)
      .eq("version", expectedVersion)
      .is("deleted_at", null)
      .select("id, owner_type, name, document_number, phone, email, status, notes, created_at, updated_at, version")
      .maybeSingle();
    if (error) throw friendlyError(error, "Não foi possível inativar o proprietário.");
    if (!data) throw new OwnerConcurrencyError();
    return mapRow(data as OwnerRow);
  },

  async softDelete(id: string, expectedVersion: number) {
    const { data, error } = await supabase.rpc("soft_delete_record", {
      p_entity_type: "owners",
      p_id: id,
      p_expected_version: expectedVersion,
    });
    if (error) throw friendlyError(error, "Não foi possível excluir o proprietário.");
    if (data !== 1) throw new OwnerConcurrencyError();
  },
};
