import { FunctionHttpError } from "../_shared/authenticatedContext.ts";

export interface DesktopPayload {
  sync_id: string;
  proposal_number: string;
  proponent_name: string;
  created_at: string | null;
  updated_at: string | null;
  created_by_technician_name: string | null;
  responsible_name: string;
  technician_name: string;
  bank: string;
  purpose: string;
  total_value: string;
  fno_value: string;
  of_value: string;
}

export const payloadFields = ["sync_id", "proposal_number", "proponent_name", "created_at", "updated_at",
  "created_by_technician_name", "responsible_name", "technician_name", "bank", "purpose", "total_value", "fno_value", "of_value"] as const;
const invalid = () => new FunctionHttpError(400, "invalid_payload", "Metadados da proposta inválidos ou incompletos.");
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const controls = /[\u0000-\u001f\u007f-\u009f]/;

function validTimestamp(value: unknown): value is string | null {
  if (value === null) return true; // Preserve unknown historical dates; never invent today's date.
  if (typeof value !== "string" || value.length > 40) return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2}))$/);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  // Leap-year arithmetic avoids Date.UTC's special treatment of years 0..99.
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour <= 23 && minute <= 59 && second <= 59
    && (match[7] === "Z" || (Number(match[8]) <= 14 && Number(match[9]) <= 59))
    && Number.isFinite(Date.parse(value));
}

export function validMoney(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40) return false;
  const match = value.match(/^(0|[1-9]\d{0,12})(?:\.(\d{1,20}))?$/);
  if (!match) return false;
  const fraction = match[2] ?? "";
  // numeric(15,2): accept exact extra trailing zeros, reject rounding, floats and exponents.
  if (/[1-9]/.test(fraction.slice(2))) return false;
  const cents = BigInt(match[1]) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, "0"));
  return cents <= 999999999999999n;
}

export function validatePayload(value: unknown): DesktopPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length !== payloadFields.length || payloadFields.some(key => !Object.hasOwn(body, key))) throw invalid();
  if (typeof body.sync_id !== "string" || !uuidV4.test(body.sync_id)) throw invalid();
  for (const [name, maximum] of Object.entries({proposal_number:100, proponent_name:200, created_by_technician_name:200,
    responsible_name:200, technician_name:200, bank:200, purpose:500})) {
    const text = body[name];
    if (name === "created_by_technician_name" && text === null) continue;
    if (typeof text !== "string" || !text.isWellFormed() || [...text].length > maximum || controls.test(text)
      || (["proposal_number", "bank"].includes(name) && !text.trim())) throw invalid();
  }
  if (!validTimestamp(body.created_at) || !validTimestamp(body.updated_at)
    || !validMoney(body.total_value) || !validMoney(body.fno_value) || !validMoney(body.of_value)) throw invalid();
  // Keep timestamp microseconds and decimal strings intact; PostgreSQL validates/canonicalizes them exactly.
  return { ...body, sync_id: body.sync_id.toLowerCase() } as unknown as DesktopPayload;
}

function positiveHeader(value: string | null): string | null {
  if (value === null) return null;
  const unquoted = value.match(/^"([1-9]\d{0,18})"$/)?.[1] ?? value;
  if (!/^[1-9]\d{0,18}$/.test(unquoted) || BigInt(unquoted) > 9223372036854775807n) throw invalid();
  return unquoted;
}

export function deliveryHeaders(headers: Headers, syncId: string) {
  if (headers.has("X-Payload-Version") && headers.get("X-Payload-Version") !== "1") throw invalid();
  const revision = positiveHeader(headers.get("X-Desktop-Revision"));
  const expectedVersion = positiveHeader(headers.get("If-Match"));
  const key = headers.get("Idempotency-Key");
  if (key !== null && (!revision || key !== `${syncId}:${revision}`)) throw invalid();
  return {revision, expectedVersion};
}

export async function readPayload(request: Request): Promise<DesktopPayload> {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw invalid();
  if (!request.body || Number(request.headers.get("Content-Length") ?? 0) > 16384) throw invalid();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 16384) { await reader.cancel(); throw invalid(); }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return validatePayload(JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(bytes)));
  } catch { throw invalid(); }
}
