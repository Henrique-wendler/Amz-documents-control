import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";
import ExcelJS from "npm:exceljs@4.4.0";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

type JsonRecord = Record<string, unknown>;
type ReportType = "farms" | "owners" | "registrations" | "operations" | "guarantees" | "documents" | "car";
type ReportExportFormat = "pdf" | "xlsx";
type Row = Record<string, unknown>;
type SpreadsheetValue = string | number | Date | null;
type SpreadsheetCellKind = "text" | "integer" | "decimal" | "currency" | "date" | "datetime";

interface ReportFilters {
  farmId: string;
  status: string;
  startDate: string;
  endDate: string;
  ownerType: "all" | "individual" | "company";
  hp: "all" | "yes" | "no";
  bank: string;
  guaranteeType: string;
  documentType: string;
  expirationWindow: "all" | "30" | "60" | "90";
}

interface ReportColumn { key: string; label: string; align?: "start" | "end"; kind?: SpreadsheetCellKind; }
interface ReportRow { id: string; values: Record<string, string>; spreadsheetValues: Record<string, SpreadsheetValue>; }
interface ReportMetric { label: string; value: string; spreadsheetValue: SpreadsheetValue; numberFormat?: string; }
interface BuiltReport { title: string; columns: ReportColumn[]; rows: ReportRow[]; metrics: ReportMetric[]; }

interface RequestContext {
  userId: string;
  userName: string;
  organizationId: string;
  organizationName: string;
  organizationLegalName: string;
  permissions: Set<string>;
  client: SupabaseClient;
}

class HttpError extends Error {
  constructor(public status: number, message: string, public code: string) { super(message); }
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const allowedOrigins = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);

if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase server environment is unavailable.");

const reportTitles: Record<ReportType, string> = {
  farms: "Fazendas",
  owners: "Proprietários",
  registrations: "Matrículas",
  operations: "Operações financeiras",
  guarantees: "Garantias",
  documents: "Documentos e vencimentos",
  car: "CAR",
};

const operationStatusLabels: Record<string, string> = {
  under_review: "Em análise", active: "Ativa", completed: "Concluída", cancelled: "Cancelada",
};
const documentStatusLabels: Record<string, string> = {
  active: "Vigente", expiring: "A vencer", expired: "Vencido", inactive: "Inativo",
};
const carStatusLabels: Record<string, string> = { active: "Ativo", pending: "Pendente", inactive: "Inativo" };
const entityStatusLabels: Record<string, string> = { active: "Ativo", inactive: "Inativo" };
const guaranteeStatusLabels: Record<string, string> = { active: "Ativa", closed: "Encerrada", cancelled: "Cancelada" };

const defaultFilters: ReportFilters = {
  farmId: "", status: "", startDate: "", endDate: "", ownerType: "all", hp: "all", bank: "",
  guaranteeType: "", documentType: "", expirationWindow: "all",
};

const statusValues: Record<ReportType, string[]> = {
  farms: ["active", "inactive"], owners: ["active", "inactive"], registrations: ["active", "inactive"],
  operations: ["under_review", "active", "completed", "cancelled"],
  guarantees: ["active", "closed", "cancelled"], documents: ["active", "expiring", "expired", "inactive"],
  car: ["active", "pending", "inactive"],
};

const json = (body: unknown, status: number, headers: HeadersInit = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
});

const corsHeaders = (origin: string | null) => {
  if (!origin) return {};
  const normalized = origin.replace(/\/+$/, "");
  if (!allowedOrigins.has(normalized)) throw new HttpError(403, "Origem não autorizada.", "origin_not_allowed");
  return {
    "Access-Control-Allow-Origin": normalized,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "Content-Disposition, X-Report-Id",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
};

const bodyAsRecord = async (request: Request) => {
  let body: unknown;
  try { body = await request.json(); } catch { throw new HttpError(400, "Requisição inválida.", "invalid_json"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Requisição inválida.", "invalid_payload");
  return body as JsonRecord;
};

const stringValue = (value: unknown, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const civilDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const validCivilDate = (value: string) => {
  if (!value) return true;
  if (!civilDatePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
};

const readPayload = (body: JsonRecord) => {
  const type = body.type;
  const format = body.format;
  if (typeof type !== "string" || !Object.prototype.hasOwnProperty.call(reportTitles, type)) throw new HttpError(400, "Tipo de relatório inválido.", "invalid_report_type");
  if (format !== "pdf" && format !== "xlsx") throw new HttpError(400, "Formato de exportação inválido.", "invalid_export_format");
  if ("organizationId" in body || "organization_id" in body) {
    throw new HttpError(400, "A organização é definida pela sessão autenticada.", "tenant_from_payload");
  }
  const raw = body.filters && typeof body.filters === "object" && !Array.isArray(body.filters) ? body.filters as JsonRecord : {};
  if ("organizationId" in raw || "organization_id" in raw) {
    throw new HttpError(400, "A organização é definida pela sessão autenticada.", "tenant_from_payload");
  }
  const reportType = type as ReportType;
  const filters: ReportFilters = {
    ...defaultFilters,
    farmId: stringValue(raw.farmId, 36),
    status: stringValue(raw.status, 32),
    startDate: stringValue(raw.startDate, 10),
    endDate: stringValue(raw.endDate, 10),
    ownerType: ["all", "individual", "company"].includes(String(raw.ownerType)) ? raw.ownerType as ReportFilters["ownerType"] : "all",
    hp: ["all", "yes", "no"].includes(String(raw.hp)) ? raw.hp as ReportFilters["hp"] : "all",
    bank: stringValue(raw.bank),
    guaranteeType: stringValue(raw.guaranteeType),
    documentType: stringValue(raw.documentType),
    expirationWindow: ["all", "30", "60", "90"].includes(String(raw.expirationWindow)) ? raw.expirationWindow as ReportFilters["expirationWindow"] : "all",
  };
  if (filters.farmId && !uuidPattern.test(filters.farmId)) throw new HttpError(400, "Filtro de Fazenda inválido.", "invalid_filter");
  if (filters.status && !statusValues[reportType].includes(filters.status)) throw new HttpError(400, "Filtro de situação inválido.", "invalid_filter");
  if (!validCivilDate(filters.startDate) || !validCivilDate(filters.endDate) || filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    throw new HttpError(400, "Período informado inválido.", "invalid_filter");
  }
  return { type: reportType, filters, includeFinancial: body.includeFinancial === true, format: format as ReportExportFormat };
};

const requireContext = async (request: Request): Promise<RequestContext> => {
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new HttpError(401, "Sessão não autenticada.", "unauthenticated");

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new HttpError(401, "Sessão inválida ou expirada.", "invalid_session");

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, organization_id, full_name, status")
    .eq("id", userData.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (profileError || !profile) throw new HttpError(403, "Seu perfil não está ativo.", "inactive_profile");

  const [{ data: organization, error: organizationError }, { data: permissionRows, error: permissionError }] = await Promise.all([
    client.from("organizations").select("id, legal_name, trade_name, status").eq("id", profile.organization_id).eq("status", "active").is("deleted_at", null).maybeSingle(),
    client.rpc("current_user_permissions"),
  ]);
  if (organizationError || !organization) throw new HttpError(403, "A organização não está disponível.", "inactive_organization");
  if (permissionError) throw new HttpError(403, "Não foi possível validar suas permissões.", "permission_unavailable");
  const permissions = new Set(((permissionRows ?? []) as Array<{ permission_key: string }>).map((item) => item.permission_key));
  ["reports.read", "reports.generate", "reports.export"].forEach((permission) => {
    if (!permissions.has(permission)) throw new HttpError(403, "Você não possui permissão para exportar relatórios.", "forbidden");
  });

  return {
    userId: userData.user.id,
    userName: profile.full_name as string,
    organizationId: profile.organization_id as string,
    organizationName: (organization.trade_name || organization.legal_name) as string,
    organizationLegalName: organization.legal_name as string,
    permissions,
    client,
  };
};

const fetchRows = async (
  client: SupabaseClient,
  table: string,
  selection: string,
  organizationId: string,
  options: { deleted?: boolean; orderBy?: string } = {},
) => {
  const result: Row[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from(table).select(selection).eq("organization_id", organizationId);
    if (options.deleted !== false) query = query.is("deleted_at", null);
    query = query.order(options.orderBy ?? "id", { ascending: true }).range(offset, offset + pageSize - 1);
    const { data, error } = await query;
    if (error) {
      const forbidden = error.code === "42501" || error.code === "PGRST301";
      throw new HttpError(forbidden ? 403 : 500, forbidden ? "Você não possui permissão para consultar os dados deste relatório." : "Não foi possível consultar os dados do relatório.", forbidden ? "data_forbidden" : "query_failed");
    }
    const rows = (data ?? []) as Row[];
    result.push(...rows);
    if (rows.length < pageSize) break;
  }
  return result;
};

const str = (value: unknown) => typeof value === "string" ? value : value == null ? "" : String(value);
const num = (value: unknown) => Number(value ?? 0) || 0;
const bool = (value: unknown) => value === true;
const count = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const area = (value: number) => `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value)} ha`;
const formatDocument = (value: unknown) => {
  const digits = str(value).replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return str(value) || "—";
};
const isoCivil = (value: unknown) => str(value).slice(0, 10);
const formatCivil = (value: unknown) => {
  const date = isoCivil(value);
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
};
const formatTimestamp = (value: unknown) => {
  const date = new Date(str(value));
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";
};
const spreadsheetCivilDate = (value: unknown) => {
  const match = isoCivil(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)) : null;
};
const spreadsheetTimestamp = (value: unknown) => {
  const date = new Date(str(value));
  return Number.isNaN(date.getTime()) ? null : date;
};
const todayCivil = () => new Date().toISOString().slice(0, 10);
const civilDaysBetween = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const statusMatches = (status: unknown, filters: ReportFilters) => !filters.status || status === filters.status;
const farmMatches = (farmIds: string[], filters: ReportFilters) => !filters.farmId || farmIds.includes(filters.farmId);
const inPeriod = (date: unknown, filters: ReportFilters) => {
  if (!filters.startDate && !filters.endDate) return true;
  const value = isoCivil(date);
  return Boolean(value && (!filters.startDate || value >= filters.startDate) && (!filters.endDate || value <= filters.endDate));
};
const columns = (items: Array<[string, string, ("start" | "end")?, SpreadsheetCellKind?]>): ReportColumn[] => items.map(([key, label, align, kind]) => ({ key, label, align, kind }));
const reportRow = (id: unknown, values: Record<string, string>, spreadsheetValues: Record<string, SpreadsheetValue> = {}): ReportRow => ({ id: str(id), values, spreadsheetValues: { ...values, ...spreadsheetValues } });
const metric = (label: string, value: string, spreadsheetValue: SpreadsheetValue = value, numberFormat?: string): ReportMetric => ({ label, value, spreadsheetValue, numberFormat });
const metrics = (rows: ReportRow[]): ReportMetric[] => [metric("Registros", count(rows.length), rows.length, "#,##0")];

const buildFarms = async (context: RequestContext, filters: ReportFilters): Promise<BuiltReport> => {
  const [farms, registrations] = await Promise.all([
    fetchRows(context.client, "farms", "id,name,municipality,state,total_area,status,updated_at", context.organizationId),
    fetchRows(context.client, "registrations", "id,farm_id", context.organizationId),
  ]);
  const registrationCounts = new Map<string, number>();
  registrations.forEach((item) => registrationCounts.set(str(item.farm_id), (registrationCounts.get(str(item.farm_id)) ?? 0) + 1));
  const selected = farms.filter((farm) => farmMatches([str(farm.id)], filters) && statusMatches(farm.status, filters));
  const rows = selected.map((farm) => reportRow(farm.id, {
    name: str(farm.name), location: `${str(farm.municipality)} / ${str(farm.state)}`, area: area(num(farm.total_area)),
    registrations: count(registrationCounts.get(str(farm.id)) ?? 0), status: str(farm.status) === "active" ? "Ativa" : "Inativa", updated: formatTimestamp(farm.updated_at),
  }, { area: num(farm.total_area), registrations: registrationCounts.get(str(farm.id)) ?? 0, updated: spreadsheetTimestamp(farm.updated_at) }));
  const totalArea = selected.reduce((sum, farm) => sum + num(farm.total_area), 0);
  return { title: reportTitles.farms, columns: columns([["name", "Fazenda"], ["location", "Município / UF"], ["area", "Área total", "end", "decimal"], ["registrations", "Matrículas", "end", "integer"], ["status", "Situação"], ["updated", "Atualizado em", undefined, "datetime"]]), rows, metrics: [...metrics(rows), metric("Área total", area(totalArea), totalArea, '#,##0.0000 "ha"')] };
};

const buildOwners = async (context: RequestContext, filters: ReportFilters): Promise<BuiltReport> => {
  const [owners, links, registrations] = await Promise.all([
    fetchRows(context.client, "owners", "id,owner_type,name,document_number,status,updated_at", context.organizationId),
    fetchRows(context.client, "ownership_links", "id,owner_id,registration_id,status,end_date", context.organizationId),
    fetchRows(context.client, "registrations", "id,farm_id", context.organizationId),
  ]);
  const farmByRegistration = new Map(registrations.map((item) => [str(item.id), str(item.farm_id)]));
  const farmsByOwner = new Map<string, Set<string>>();
  links.filter((link) => link.status === "active" && !link.end_date).forEach((link) => {
    const set = farmsByOwner.get(str(link.owner_id)) ?? new Set<string>();
    const farmId = farmByRegistration.get(str(link.registration_id));
    if (farmId) set.add(farmId);
    farmsByOwner.set(str(link.owner_id), set);
  });
  const selected = owners.filter((owner) => statusMatches(owner.status, filters)
    && (filters.ownerType === "all" || owner.owner_type === filters.ownerType)
    && farmMatches([...(farmsByOwner.get(str(owner.id)) ?? [])], filters));
  const rows = selected.map((owner) => reportRow(owner.id, {
    name: str(owner.name), type: owner.owner_type === "individual" ? "Pessoa Física" : "Pessoa Jurídica",
    document: formatDocument(owner.document_number), farms: count(farmsByOwner.get(str(owner.id))?.size ?? 0),
    status: entityStatusLabels[str(owner.status)] ?? str(owner.status), updated: formatTimestamp(owner.updated_at),
  }, { farms: farmsByOwner.get(str(owner.id))?.size ?? 0, updated: spreadsheetTimestamp(owner.updated_at) }));
  const individualCount = selected.filter((owner) => owner.owner_type === "individual").length;
  const companyCount = selected.filter((owner) => owner.owner_type === "company").length;
  return { title: reportTitles.owners, columns: columns([["name", "Proprietário"], ["type", "Tipo"], ["document", "CPF / CNPJ"], ["farms", "Fazendas", "end", "integer"], ["status", "Situação"], ["updated", "Atualizado em", undefined, "datetime"]]), rows, metrics: [...metrics(rows), metric("Pessoas físicas", count(individualCount), individualCount, "#,##0"), metric("Pessoas jurídicas", count(companyCount), companyCount, "#,##0")] };
};

const buildRegistrations = async (context: RequestContext, filters: ReportFilters): Promise<BuiltReport> => {
  const [registrations, farms, links, owners] = await Promise.all([
    fetchRows(context.client, "registrations", "id,farm_id,number,legal_area,status,updated_at", context.organizationId),
    fetchRows(context.client, "farms", "id,name", context.organizationId),
    fetchRows(context.client, "ownership_links", "id,owner_id,registration_id,status,end_date", context.organizationId),
    fetchRows(context.client, "owners", "id,name", context.organizationId),
  ]);
  const farmById = new Map(farms.map((item) => [str(item.id), str(item.name)]));
  const ownerById = new Map(owners.map((item) => [str(item.id), str(item.name)]));
  const ownersByRegistration = new Map<string, string[]>();
  links.filter((link) => link.status === "active" && !link.end_date).forEach((link) => {
    const ownerName = ownerById.get(str(link.owner_id));
    if (ownerName) ownersByRegistration.set(str(link.registration_id), [...(ownersByRegistration.get(str(link.registration_id)) ?? []), ownerName]);
  });
  const selected = registrations.filter((registration) => farmMatches([str(registration.farm_id)], filters) && statusMatches(registration.status, filters));
  const rows = selected.map((registration) => reportRow(registration.id, {
    number: str(registration.number), farm: farmById.get(str(registration.farm_id)) ?? "—",
    owners: unique(ownersByRegistration.get(str(registration.id)) ?? []).join(", ") || "—", hp: "Pendente de definição",
    area: area(num(registration.legal_area)), status: str(registration.status) === "active" ? "Ativa" : "Inativa", updated: formatTimestamp(registration.updated_at),
  }, { area: num(registration.legal_area), updated: spreadsheetTimestamp(registration.updated_at) }));
  const totalLegalArea = selected.reduce((sum, registration) => sum + num(registration.legal_area), 0);
  return { title: reportTitles.registrations, columns: columns([["number", "Matrícula"], ["farm", "Fazenda"], ["owners", "Proprietário"], ["hp", "HP"], ["area", "Área legal", "end", "decimal"], ["status", "Situação"], ["updated", "Atualizado em", undefined, "datetime"]]), rows, metrics: [...metrics(rows), metric("Área legal", area(totalLegalArea), totalLegalArea, '#,##0.0000 "ha"'), metric("HP", "Pendente de definição")] };
};

const buildOperations = async (context: RequestContext, filters: ReportFilters, includeFinancial: boolean): Promise<BuiltReport> => {
  const requests = [
    fetchRows(context.client, "operations", "id,operation_number,institution_id,purpose,status,start_date,created_at", context.organizationId),
    fetchRows(context.client, "operation_registrations", "operation_id,registration_id,is_primary", context.organizationId, { deleted: false, orderBy: "operation_id" }),
    fetchRows(context.client, "registrations", "id,farm_id,number", context.organizationId),
    fetchRows(context.client, "farms", "id,name", context.organizationId),
    fetchRows(context.client, "financial_institutions", "id,name", context.organizationId),
  ];
  if (includeFinancial) requests.push(fetchRows(context.client, "operation_financials", "operation_id,amount", context.organizationId, { deleted: false, orderBy: "operation_id" }));
  const [operations, links, registrations, farms, institutions, financials = []] = await Promise.all(requests);
  const registrationById = new Map(registrations.map((item) => [str(item.id), item]));
  const farmById = new Map(farms.map((item) => [str(item.id), str(item.name)]));
  const institutionById = new Map(institutions.map((item) => [str(item.id), str(item.name)]));
  const amountByOperation = new Map(financials.map((item) => [str(item.operation_id), num(item.amount)]));
  const linksByOperation = new Map<string, Row[]>();
  links.forEach((link) => linksByOperation.set(str(link.operation_id), [...(linksByOperation.get(str(link.operation_id)) ?? []), link]));
  const farmIdsFor = (operationId: string) => unique((linksByOperation.get(operationId) ?? []).map((link) => str(registrationById.get(str(link.registration_id))?.farm_id)));
  const selected = operations.filter((operation) => {
    const date = operation.start_date || operation.created_at;
    return farmMatches(farmIdsFor(str(operation.id)), filters) && statusMatches(operation.status, filters)
      && (!filters.bank || institutionById.get(str(operation.institution_id)) === filters.bank) && inPeriod(date, filters);
  });
  const reportColumns = columns([["number", "Número"], ["farm", "Fazenda"], ["registration", "Matrícula"], ["bank", "Banco"], ["purpose", "Finalidade"]]);
  if (includeFinancial) reportColumns.push({ key: "value", label: "Valor", align: "end", kind: "currency" });
  reportColumns.push(...columns([["status", "Situação"], ["date", "Data", undefined, "date"]]));
  const rows = selected.map((operation) => {
    const registrationsForOperation = (linksByOperation.get(str(operation.id)) ?? []).map((link) => registrationById.get(str(link.registration_id))).filter(Boolean) as Row[];
    const values: Record<string, string> = {
      number: str(operation.operation_number), farm: unique(registrationsForOperation.map((registration) => farmById.get(str(registration.farm_id)) ?? "")).join(", ") || "—",
      registration: registrationsForOperation.map((registration) => str(registration.number)).join(", ") || "—",
      bank: institutionById.get(str(operation.institution_id)) ?? "—", purpose: str(operation.purpose) || "—",
      status: operationStatusLabels[str(operation.status)] ?? str(operation.status), date: formatCivil(operation.start_date || operation.created_at),
    };
    const operationAmount = amountByOperation.get(str(operation.id)) ?? 0;
    if (includeFinancial) values.value = money(operationAmount);
    return reportRow(operation.id, values, { date: spreadsheetCivilDate(operation.start_date || operation.created_at), ...(includeFinancial ? { value: operationAmount } : {}) });
  });
  const reportMetrics = [...metrics(rows)];
  const operationTotal = selected.reduce((sum, operation) => sum + (amountByOperation.get(str(operation.id)) ?? 0), 0);
  const activeOperations = selected.filter((operation) => operation.status === "active").length;
  if (includeFinancial) reportMetrics.push(metric("Valor das operações", money(operationTotal), operationTotal, '"R$" #,##0.00'));
  reportMetrics.push(metric("Operações ativas", count(activeOperations), activeOperations, "#,##0"));
  return { title: reportTitles.operations, columns: reportColumns, rows, metrics: reportMetrics };
};

const buildGuarantees = async (context: RequestContext, filters: ReportFilters, includeFinancial: boolean): Promise<BuiltReport> => {
  const requests = [
    fetchRows(context.client, "guarantees", "id,operation_id,status,start_date,created_at", context.organizationId),
    fetchRows(context.client, "guarantee_type_links", "guarantee_id,guarantee_type_id,is_primary", context.organizationId, { deleted: false, orderBy: "guarantee_id" }),
    fetchRows(context.client, "guarantee_types", "id,name", context.organizationId),
    fetchRows(context.client, "guarantee_registrations", "guarantee_id,registration_id", context.organizationId, { deleted: false, orderBy: "guarantee_id" }),
    fetchRows(context.client, "registrations", "id,farm_id,number", context.organizationId),
    fetchRows(context.client, "farms", "id,name", context.organizationId),
    fetchRows(context.client, "operations", "id,operation_number,institution_id", context.organizationId),
    fetchRows(context.client, "financial_institutions", "id,name", context.organizationId),
  ];
  if (includeFinancial) requests.push(fetchRows(context.client, "guarantee_financials", "guarantee_id,amount", context.organizationId, { deleted: false, orderBy: "guarantee_id" }));
  const [guarantees, typeLinks, types, registrationLinks, registrations, farms, operations, institutions, financials = []] = await Promise.all(requests);
  const typeById = new Map(types.map((item) => [str(item.id), str(item.name)]));
  const registrationById = new Map(registrations.map((item) => [str(item.id), item]));
  const farmById = new Map(farms.map((item) => [str(item.id), str(item.name)]));
  const operationById = new Map(operations.map((item) => [str(item.id), item]));
  const institutionById = new Map(institutions.map((item) => [str(item.id), str(item.name)]));
  const amountByGuarantee = new Map(financials.map((item) => [str(item.guarantee_id), num(item.amount)]));
  const typesByGuarantee = new Map<string, string[]>();
  typeLinks.forEach((link) => { const name = typeById.get(str(link.guarantee_type_id)); if (name) typesByGuarantee.set(str(link.guarantee_id), [...(typesByGuarantee.get(str(link.guarantee_id)) ?? []), name]); });
  const registrationsByGuarantee = new Map<string, Row[]>();
  registrationLinks.forEach((link) => { const item = registrationById.get(str(link.registration_id)); if (item) registrationsByGuarantee.set(str(link.guarantee_id), [...(registrationsByGuarantee.get(str(link.guarantee_id)) ?? []), item]); });
  const selected = guarantees.filter((guarantee) => {
    const linkedRegistrations = registrationsByGuarantee.get(str(guarantee.id)) ?? [];
    const operation = operationById.get(str(guarantee.operation_id));
    const typeNames = typesByGuarantee.get(str(guarantee.id)) ?? [];
    return farmMatches(unique(linkedRegistrations.map((registration) => str(registration.farm_id))), filters)
      && statusMatches(guarantee.status, filters)
      && (!filters.bank || institutionById.get(str(operation?.institution_id)) === filters.bank)
      && (!filters.guaranteeType || typeNames.includes(filters.guaranteeType))
      && inPeriod(guarantee.start_date || guarantee.created_at, filters);
  });
  const reportColumns = columns([["type", "Tipo"], ["operation", "Operação"], ["farm", "Fazenda"], ["registration", "Matrícula"], ["bank", "Banco"]]);
  if (includeFinancial) reportColumns.push({ key: "value", label: "Valor", align: "end", kind: "currency" });
  reportColumns.push(...columns([["status", "Situação"], ["date", "Data", undefined, "date"]]));
  const rows = selected.map((guarantee) => {
    const linkedRegistrations = registrationsByGuarantee.get(str(guarantee.id)) ?? [];
    const operation = operationById.get(str(guarantee.operation_id));
    const values: Record<string, string> = {
      type: (typesByGuarantee.get(str(guarantee.id)) ?? []).join(", ") || "—", operation: str(operation?.operation_number) || "—",
      farm: unique(linkedRegistrations.map((registration) => farmById.get(str(registration.farm_id)) ?? "")).join(", ") || "—",
      registration: linkedRegistrations.map((registration) => str(registration.number)).join(", ") || "—",
      bank: institutionById.get(str(operation?.institution_id)) ?? "—",
      status: guaranteeStatusLabels[str(guarantee.status)] ?? str(guarantee.status), date: formatCivil(guarantee.start_date || guarantee.created_at),
    };
    const guaranteeAmount = amountByGuarantee.get(str(guarantee.id)) ?? 0;
    if (includeFinancial) values.value = money(guaranteeAmount);
    return reportRow(guarantee.id, values, { date: spreadsheetCivilDate(guarantee.start_date || guarantee.created_at), ...(includeFinancial ? { value: guaranteeAmount } : {}) });
  });
  const reportMetrics = [...metrics(rows)];
  const guaranteeTotal = selected.reduce((sum, guarantee) => sum + (amountByGuarantee.get(str(guarantee.id)) ?? 0), 0);
  const activeGuarantees = selected.filter((guarantee) => guarantee.status === "active").length;
  if (includeFinancial) reportMetrics.push(metric("Valor das garantias", money(guaranteeTotal), guaranteeTotal, '"R$" #,##0.00'));
  reportMetrics.push(metric("Garantias ativas", count(activeGuarantees), activeGuarantees, "#,##0"));
  return { title: reportTitles.guarantees, columns: reportColumns, rows, metrics: reportMetrics };
};

const buildDocuments = async (context: RequestContext, filters: ReportFilters): Promise<BuiltReport> => {
  const [documents, types, farms, registrations] = await Promise.all([
    fetchRows(context.client, "rural_documents_with_validity", "id,farm_id,registration_id,document_type_id,document_number,issue_date,expiration_date,validity_status,created_at", context.organizationId),
    fetchRows(context.client, "document_types", "id,name", context.organizationId),
    fetchRows(context.client, "farms", "id,name", context.organizationId),
    fetchRows(context.client, "registrations", "id,number", context.organizationId),
  ]);
  const typeById = new Map(types.map((item) => [str(item.id), str(item.name)]));
  const farmById = new Map(farms.map((item) => [str(item.id), str(item.name)]));
  const registrationById = new Map(registrations.map((item) => [str(item.id), str(item.number)]));
  const today = todayCivil();
  const selected = documents.filter((document) => {
    const expirationDate = isoCivil(document.expiration_date);
    const days = expirationDate ? civilDaysBetween(today, expirationDate) : undefined;
    return farmMatches([str(document.farm_id)], filters) && statusMatches(document.validity_status, filters)
      && (!filters.documentType || typeById.get(str(document.document_type_id)) === filters.documentType)
      && (filters.expirationWindow === "all" || days !== undefined && days >= 0 && days <= Number(filters.expirationWindow))
      && inPeriod(document.expiration_date || document.issue_date || document.created_at, filters);
  });
  const rows = selected.map((document) => {
    const typeName = typeById.get(str(document.document_type_id)) ?? "Documento";
    return reportRow(document.id, {
      document: document.document_number ? `${typeName} · ${str(document.document_number)}` : typeName,
      farm: farmById.get(str(document.farm_id)) ?? "—", registration: document.registration_id ? registrationById.get(str(document.registration_id)) ?? "—" : "—",
      validity: formatCivil(document.expiration_date), status: documentStatusLabels[str(document.validity_status)] ?? str(document.validity_status),
    }, { validity: spreadsheetCivilDate(document.expiration_date) });
  });
  const expirationCount = selected.filter((document) => ["expiring", "expired"].includes(str(document.validity_status))).length;
  const datedCount = selected.filter((document) => Boolean(document.expiration_date)).length;
  return { title: reportTitles.documents, columns: columns([["document", "Documento"], ["farm", "Fazenda"], ["registration", "Matrícula"], ["validity", "Validade", undefined, "date"], ["status", "Situação"]]), rows, metrics: [...metrics(rows), metric("Vencidos ou a vencer", count(expirationCount), expirationCount, "#,##0"), metric("Com validade", count(datedCount), datedCount, "#,##0")] };
};

const buildCar = async (context: RequestContext, filters: ReportFilters): Promise<BuiltReport> => {
  const [cars, farms, registrations] = await Promise.all([
    fetchRows(context.client, "car_records", "id,farm_id,registration_id,car_number,receipt_number,declared_owner_name,status,updated_at", context.organizationId),
    fetchRows(context.client, "farms", "id,name", context.organizationId),
    fetchRows(context.client, "registrations", "id,number", context.organizationId),
  ]);
  const farmById = new Map(farms.map((item) => [str(item.id), str(item.name)]));
  const registrationById = new Map(registrations.map((item) => [str(item.id), str(item.number)]));
  const selected = cars.filter((car) => farmMatches([str(car.farm_id)], filters) && statusMatches(car.status, filters));
  const rows = selected.map((car) => reportRow(car.id, {
    number: str(car.car_number), farm: farmById.get(str(car.farm_id)) ?? "—",
    registration: car.registration_id ? registrationById.get(str(car.registration_id)) ?? "—" : "—",
    owner: str(car.declared_owner_name) || "—", receipt: str(car.receipt_number) || "—",
    status: carStatusLabels[str(car.status)] ?? str(car.status), updated: formatTimestamp(car.updated_at),
  }, { updated: spreadsheetTimestamp(car.updated_at) }));
  const activeCars = selected.filter((car) => car.status === "active").length;
  const pendingCars = selected.filter((car) => car.status === "pending").length;
  return { title: reportTitles.car, columns: columns([["number", "Número CAR"], ["farm", "Fazenda"], ["registration", "Matrícula"], ["owner", "Proprietário"], ["receipt", "Número do recibo"], ["status", "Situação"], ["updated", "Atualizado em", undefined, "datetime"]]), rows, metrics: [...metrics(rows), metric("Ativos", count(activeCars), activeCars, "#,##0"), metric("Pendentes", count(pendingCars), pendingCars, "#,##0")] };
};

const buildReport = (context: RequestContext, type: ReportType, filters: ReportFilters, includeFinancial: boolean) => {
  if (type === "farms") return buildFarms(context, filters);
  if (type === "owners") return buildOwners(context, filters);
  if (type === "registrations") return buildRegistrations(context, filters);
  if (type === "operations") return buildOperations(context, filters, includeFinancial);
  if (type === "guarantees") return buildGuarantees(context, filters, includeFinancial);
  if (type === "documents") return buildDocuments(context, filters);
  return buildCar(context, filters);
};

const filterDescription = (type: ReportType, filters: ReportFilters, farms: Map<string, string>, includeFinancial: boolean) => {
  const parts: string[] = [];
  if (filters.farmId) parts.push(`Fazenda: ${farms.get(filters.farmId) ?? "não localizada"}`);
  if (filters.status) {
    const labels = type === "operations" ? operationStatusLabels : type === "documents" ? documentStatusLabels : type === "car" ? carStatusLabels : type === "guarantees" ? guaranteeStatusLabels : entityStatusLabels;
    parts.push(`Situação: ${labels[filters.status] ?? filters.status}`);
  }
  if (type === "owners" && filters.ownerType !== "all") parts.push(`Tipo: ${filters.ownerType === "individual" ? "Pessoa Física" : "Pessoa Jurídica"}`);
  if (filters.bank) parts.push(`Banco: ${filters.bank}`);
  if (filters.guaranteeType) parts.push(`Tipo de garantia: ${filters.guaranteeType}`);
  if (filters.documentType) parts.push(`Tipo de documento: ${filters.documentType}`);
  if (filters.expirationWindow !== "all") parts.push(`Vencimento: próximos ${filters.expirationWindow} dias`);
  if (filters.startDate || filters.endDate) parts.push(`Período: ${filters.startDate ? formatCivil(filters.startDate) : "início"} a ${filters.endDate ? formatCivil(filters.endDate) : "hoje"}`);
  if (type === "operations" || type === "guarantees") parts.push(`Valores financeiros: ${includeFinancial ? "incluídos" : "não incluídos"}`);
  return parts.length ? parts.join(" | ") : "Sem filtros adicionais";
};

const safePdfText = (value: string) => value
  .normalize("NFC")
  .replace(/[–—]/g, "-")
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

const truncate = (text: string, font: PDFFont, size: number, width: number) => {
  const safe = safePdfText(text);
  if (font.widthOfTextAtSize(safe, size) <= width) return safe;
  let result = safe;
  while (result.length && font.widthOfTextAtSize(`${result}...`, size) > width) result = result.slice(0, -1);
  return `${result}...`;
};

const wrap = (text: string, font: PDFFont, size: number, width: number, maxLines = 3) => {
  const words = safePdfText(text).split(/\s+/).filter(Boolean);
  if (!words.length) return ["-"];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) { current = candidate; continue; }
    if (current) lines.push(current);
    current = font.widthOfTextAtSize(word, size) <= width ? word : truncate(word, font, size, width);
    if (lines.length === maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  const originalFits = lines.join(" ").length >= safePdfText(text).length;
  if (!originalFits && lines.length) lines[lines.length - 1] = truncate(`${lines[lines.length - 1]}...`, font, size, width);
  return lines.slice(0, maxLines);
};

const drawText = (page: PDFPage, text: string, options: Parameters<PDFPage["drawText"]>[1]) => page.drawText(safePdfText(text), options);

const generatePdf = async (
  report: BuiltReport,
  context: RequestContext,
  reportId: string,
  generatedAt: Date,
  filtersText: string,
) => {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  document.setTitle(`${report.title} - ${context.organizationName}`);
  document.setAuthor(context.organizationName);
  document.setSubject("Relatório administrativo");
  document.setCreator("Sistema de Gestão de Imóveis Rurais");
  document.setCreationDate(generatedAt);

  const size: [number, number] = [841.89, 595.28];
  const margin = 34;
  const tableWidth = size[0] - margin * 2;
  const generatedLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "UTC" }).format(generatedAt) + " UTC";
  const pages: PDFPage[] = [];
  const columnWeights = report.columns.map((column) => {
    const observed = report.rows.slice(0, 80).reduce((max, row) => Math.max(max, (row.values[column.key] ?? "").length), column.label.length);
    return Math.min(24, Math.max(8, observed));
  });
  const weightTotal = columnWeights.reduce((sum, value) => sum + value, 0);
  const columnWidths = columnWeights.map((value) => tableWidth * value / weightTotal);

  const header = (firstPage: boolean) => {
    const page = document.addPage(size);
    pages.push(page);
    page.drawRectangle({ x: 0, y: size[1] - 76, width: size[0], height: 76, color: rgb(0.071, 0.271, 0.173) });
    drawText(page, context.organizationName, { x: margin, y: size[1] - 26, size: 10, font: bold, color: rgb(0.91, 0.95, 0.89) });
    drawText(page, report.title, { x: margin, y: size[1] - 53, size: 20, font: bold, color: rgb(1, 1, 1) });
    const rightText = firstPage ? "RELATÓRIO ADMINISTRATIVO" : `CONTINUAÇÃO · ${reportId.slice(0, 8)}`;
    drawText(page, rightText, { x: size[0] - margin - bold.widthOfTextAtSize(safePdfText(rightText), 9), y: size[1] - 28, size: 9, font: bold, color: rgb(0.91, 0.95, 0.89) });
    return page;
  };

  let page = header(true);
  let y = size[1] - 98;
  drawText(page, `Emitente: ${context.organizationLegalName}`, { x: margin, y, size: 8.5, font: regular, color: rgb(0.25, 0.25, 0.25) });
  drawText(page, `Gerado por: ${context.userName}`, { x: 310, y, size: 8.5, font: regular, color: rgb(0.25, 0.25, 0.25) });
  drawText(page, `Data: ${generatedLabel}`, { x: 560, y, size: 8.5, font: regular, color: rgb(0.25, 0.25, 0.25) });
  y -= 15;
  drawText(page, `ID do relatório: ${reportId}`, { x: margin, y, size: 8.2, font: regular, color: rgb(0.35, 0.35, 0.35) });
  y -= 20;

  const filterLines = wrap(`Filtros: ${filtersText}`, regular, 8.3, tableWidth - 18, 3);
  const filterHeight = 15 + filterLines.length * 10;
  page.drawRectangle({ x: margin, y: y - filterHeight + 5, width: tableWidth, height: filterHeight, color: rgb(0.961, 0.945, 0.91), borderColor: rgb(0.84, 0.82, 0.76), borderWidth: 0.6 });
  filterLines.forEach((line, index) => drawText(page, line, { x: margin + 9, y: y - 8 - index * 10, size: 8.3, font: index === 0 ? bold : regular, color: rgb(0.25, 0.25, 0.25) }));
  y -= filterHeight + 12;

  const metricGap = 8;
  const metricWidth = Math.min(185, (tableWidth - metricGap * Math.max(0, report.metrics.length - 1)) / Math.max(1, report.metrics.length));
  report.metrics.forEach((metric, index) => {
    const x = margin + index * (metricWidth + metricGap);
    page.drawRectangle({ x, y: y - 42, width: metricWidth, height: 42, color: rgb(0.91, 0.941, 0.89), borderColor: rgb(0.56, 0.667, 0.482), borderWidth: 0.5 });
    drawText(page, truncate(metric.label, regular, 7.5, metricWidth - 14), { x: x + 7, y: y - 14, size: 7.5, font: regular, color: rgb(0.28, 0.32, 0.28) });
    drawText(page, truncate(metric.value, bold, 12, metricWidth - 14), { x: x + 7, y: y - 32, size: 12, font: bold, color: rgb(0.071, 0.271, 0.173) });
  });
  y -= 57;

  const drawTableHeader = () => {
    page.drawRectangle({ x: margin, y: y - 22, width: tableWidth, height: 22, color: rgb(0.094, 0.361, 0.216) });
    let x = margin;
    report.columns.forEach((column, index) => {
      const width = columnWidths[index];
      drawText(page, truncate(column.label, bold, 7.4, width - 8), { x: x + 4, y: y - 14, size: 7.4, font: bold, color: rgb(1, 1, 1) });
      x += width;
    });
    y -= 22;
  };

  drawTableHeader();
  if (!report.rows.length) {
    drawText(page, "Nenhum registro encontrado para os filtros informados.", { x: margin + 8, y: y - 20, size: 9, font: regular, color: rgb(0.35, 0.35, 0.35) });
    y -= 34;
  } else {
    for (let rowIndex = 0; rowIndex < report.rows.length; rowIndex += 1) {
      const item = report.rows[rowIndex];
      const cellLines = report.columns.map((column, index) => wrap(item.values[column.key] ?? "—", regular, 7.2, columnWidths[index] - 8, 3));
      const rowHeight = Math.max(20, Math.max(...cellLines.map((lines) => lines.length)) * 9 + 7);
      if (y - rowHeight < 42) {
        page = header(false);
        y = size[1] - 96;
        drawTableHeader();
      }
      if (rowIndex % 2 === 1) page.drawRectangle({ x: margin, y: y - rowHeight, width: tableWidth, height: rowHeight, color: rgb(0.973, 0.978, 0.969) });
      page.drawLine({ start: { x: margin, y: y - rowHeight }, end: { x: margin + tableWidth, y: y - rowHeight }, thickness: 0.35, color: rgb(0.84, 0.86, 0.83) });
      let x = margin;
      report.columns.forEach((column, columnIndex) => {
        const width = columnWidths[columnIndex];
        cellLines[columnIndex].forEach((line, lineIndex) => {
          const textWidth = regular.widthOfTextAtSize(line, 7.2);
          const textX = column.align === "end" ? x + width - 4 - textWidth : x + 4;
          drawText(page, line, { x: textX, y: y - 12 - lineIndex * 9, size: 7.2, font: regular, color: rgb(0.18, 0.18, 0.18) });
        });
        x += width;
      });
      y -= rowHeight;
    }
  }

  pages.forEach((currentPage, index) => {
    const footer = `Relatório ${reportId} · Página ${index + 1} de ${pages.length}`;
    drawText(currentPage, footer, { x: margin, y: 19, size: 7.2, font: regular, color: rgb(0.42, 0.42, 0.42) });
    const dateWidth = regular.widthOfTextAtSize(safePdfText(generatedLabel), 7.2);
    drawText(currentPage, generatedLabel, { x: size[0] - margin - dateWidth, y: 19, size: 7.2, font: regular, color: rgb(0.42, 0.42, 0.42) });
  });
  return { bytes: await document.save(), pageCount: pages.length };
};

const spreadsheetNumberFormat = (kind?: SpreadsheetCellKind) => {
  if (kind === "integer") return "#,##0";
  if (kind === "decimal") return '#,##0.0000 "ha"';
  if (kind === "currency") return '"R$" #,##0.00';
  if (kind === "date") return "dd/mm/yyyy";
  if (kind === "datetime") return "dd/mm/yyyy hh:mm";
  return undefined;
};

const generateXlsx = async (
  report: BuiltReport,
  context: RequestContext,
  reportId: string,
  generatedAt: Date,
  filtersText: string,
) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema de Gestão de Imóveis Rurais";
  workbook.lastModifiedBy = context.userName;
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.subject = `Relatório ${report.title}`;
  workbook.title = `${report.title} - ${context.organizationName}`;
  workbook.company = context.organizationLegalName;

  const colors = {
    forest: "FF185C37", dark: "FF12452C", sage: "FF8FAA7B", light: "FFE8F0E3",
    beige: "FFF5F1E8", white: "FFFFFFFF", text: "FF414141", border: "FFD5DDD2",
  };
  const thinRule = { style: "thin" as const, color: { argb: colors.border } };
  const summary = workbook.addWorksheet("Resumo", { properties: { tabColor: { argb: colors.sage } }, views: [{ showGridLines: false }] });
  summary.columns = [{ width: 25 }, { width: 90 }];
  summary.getCell("A1").value = report.title;
  summary.getCell("A1").font = { name: "Arial", size: 18, bold: true, color: { argb: colors.dark } };
  summary.getCell("A2").value = "Relatório administrativo";
  summary.getCell("A2").font = { name: "Arial", size: 10, italic: true, color: { argb: colors.text } };
  summary.getRow(3).border = { bottom: thinRule };

  const metadata: Array<[string, string | Date]> = [
    ["Organização", context.organizationName],
    ["Razão social", context.organizationLegalName],
    ["Tipo de relatório", report.title],
    ["Filtros", filtersText],
    ["Data de geração", generatedAt],
    ["Usuário", context.userName],
    ["Report ID", reportId],
  ];
  metadata.forEach(([label, value], index) => {
    const row = summary.getRow(index + 4);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    row.getCell(1).font = { name: "Arial", size: 10, bold: true, color: { argb: colors.dark } };
    row.getCell(2).font = { name: "Arial", size: 10, color: { argb: colors.text } };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.light } };
    row.getCell(1).alignment = { vertical: "top" };
    row.getCell(2).alignment = { vertical: "top", wrapText: true };
    row.border = { bottom: thinRule };
    if (label === "Data de geração") row.getCell(2).numFmt = "dd/mm/yyyy hh:mm";
  });
  summary.getRow(7).height = Math.max(24, Math.ceil(filtersText.length / 85) * 15);

  const metricHeaderRow = 12;
  summary.getRow(metricHeaderRow).values = ["Resumo", "Valor"];
  summary.getRow(metricHeaderRow).height = 24;
  summary.getRow(metricHeaderRow).eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: colors.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.forest } };
    cell.alignment = { vertical: "middle" };
  });
  report.metrics.forEach((item, index) => {
    const row = summary.getRow(metricHeaderRow + index + 1);
    row.values = [item.label, item.spreadsheetValue];
    row.height = 22;
    row.eachCell((cell) => {
      cell.font = { name: "Arial", size: 10, color: { argb: colors.text } };
      cell.border = { bottom: thinRule };
    });
    if (item.numberFormat) row.getCell(2).numFmt = item.numberFormat;
  });
  summary.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };

  const sheetName = report.title.slice(0, 31);
  const records = workbook.addWorksheet(sheetName, { properties: { tabColor: { argb: colors.forest } }, views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  records.getCell("A1").value = report.title;
  records.getCell("A1").font = { name: "Arial", size: 16, bold: true, color: { argb: colors.dark } };
  records.getCell("A2").value = `${context.organizationName} · Gerado em ${formatTimestamp(generatedAt.toISOString())}`;
  records.getCell("A2").font = { name: "Arial", size: 9, italic: true, color: { argb: colors.text } };
  records.getRow(3).border = { bottom: thinRule };

  const tableHeaderRow = 4;
  const header = records.getRow(tableHeaderRow);
  header.values = report.columns.map((column) => column.label);
  header.height = 26;
  header.eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: colors.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.forest } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { right: { style: "thin", color: { argb: colors.white } } };
  });

  report.rows.forEach((item, rowIndex) => {
    const row = records.getRow(tableHeaderRow + rowIndex + 1);
    row.values = report.columns.map((column) => item.spreadsheetValues[column.key] ?? null);
    row.height = 22;
    report.columns.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      cell.font = { name: "Arial", size: 10, color: { argb: colors.text } };
      cell.alignment = { horizontal: column.align === "end" ? "right" : "left", vertical: "top", wrapText: true, indent: column.align === "end" ? 0 : 1 };
      cell.border = { bottom: thinRule, right: thinRule };
      const numberFormat = spreadsheetNumberFormat(column.kind);
      if (numberFormat) cell.numFmt = numberFormat;
      if (rowIndex % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9F6" } };
    });
  });
  report.columns.forEach((column, index) => {
    const observed = report.rows.slice(0, 200).reduce((max, row) => Math.max(max, (row.values[column.key] ?? "").length), column.label.length);
    const minimumWidth = column.kind === "currency" ? 22 : column.kind === "date" ? 13 : column.kind === "datetime" ? 19 : 12;
    records.getColumn(index + 1).width = Math.min(42, Math.max(minimumWidth, observed + 4));
  });
  records.autoFilter = { from: { row: tableHeaderRow, column: 1 }, to: { row: tableHeaderRow, column: report.columns.length } };
  records.pageSetup = { orientation: report.columns.length > 6 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, repeatRows: `${tableHeaderRow}:${tableHeaderRow}`, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  records.headerFooter.oddFooter = `&LRelatório ${reportId}&R&P de &N`;

  const output = await workbook.xlsx.writeBuffer();
  return { bytes: new Uint8Array(output), worksheetCount: workbook.worksheets.length };
};

const rateWindows = new Map<string, { count: number; resetAt: number }>();
const checkRateLimit = (userId: string) => {
  const now = Date.now();
  const current = rateWindows.get(userId);
  if (!current || current.resetAt <= now) { rateWindows.set(userId, { count: 1, resetAt: now + 60_000 }); return; }
  if (current.count >= 15) throw new HttpError(429, "Muitas exportações em sequência. Aguarde um minuto.", "rate_limited");
  current.count += 1;
};

Deno.serve(async (request) => {
  let headers: HeadersInit = {};
  try {
    headers = corsHeaders(request.headers.get("Origin"));
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") throw new HttpError(405, "Método não permitido.", "method_not_allowed");

    const context = await requireContext(request);
    checkRateLimit(context.userId);
    const payload = readPayload(await bodyAsRecord(request));
    const financialReport = payload.type === "operations" || payload.type === "guarantees";
    const includeFinancial = financialReport && payload.includeFinancial;
    if (includeFinancial && (!context.permissions.has("financial.read") || !context.permissions.has("reports.financial"))) {
      throw new HttpError(403, "Você não possui permissão para incluir valores financeiros.", "financial_forbidden");
    }

    const report = await buildReport(context, payload.type, payload.filters, includeFinancial);
    const farmRows = payload.filters.farmId
      ? await fetchRows(context.client, "farms", "id,name", context.organizationId)
      : [];
    const farmNames = new Map(farmRows.map((farm) => [str(farm.id), str(farm.name)]));
    const reportId = crypto.randomUUID();
    const generatedAt = new Date();
    const filtersText = filterDescription(payload.type, payload.filters, farmNames, includeFinancial);
    const generated = payload.format === "pdf"
      ? await generatePdf(report, context, reportId, generatedAt, filtersText)
      : await generateXlsx(report, context, reportId, generatedAt, filtersText);

    const timestamp = generatedAt.toISOString();
    const { error: logError } = await context.client.from("report_log").insert({
      id: reportId,
      user_id: context.userId,
      organization_id: context.organizationId,
      report_type: payload.type,
      filters: payload.filters,
      included_sections: { summary: true, table: true, include_financial_values: includeFinancial },
      format: payload.format,
      generated_at: timestamp,
      downloaded_at: timestamp,
      context: {
        row_count: report.rows.length,
        ...(payload.format === "pdf" ? { page_count: generated.pageCount } : { worksheet_count: generated.worksheetCount }),
        delivery: "direct_temporary_download",
      },
    });
    if (logError) throw new HttpError(logError.code === "42501" ? 403 : 500, "Não foi possível registrar a geração do relatório.", "report_log_failed");

    const date = timestamp.slice(0, 10);
    const contentType = payload.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const fileName = `relatorio-${payload.type}-${date}-${reportId.slice(0, 8)}.${payload.format}`;
    return new Response(new Blob([generated.bytes], { type: contentType }), {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "X-Report-Id": reportId,
        "Cache-Control": "private, no-store, max-age=0",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-site",
      },
    });
  } catch (reason) {
    if (reason instanceof HttpError) return json({ error: reason.message, code: reason.code }, reason.status, headers);
    return json({ error: "Não foi possível gerar o relatório no momento.", code: "internal_error" }, 500, headers);
  }
});
