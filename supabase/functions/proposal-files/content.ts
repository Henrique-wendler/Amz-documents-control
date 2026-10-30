import { FunctionHttpError } from "../_shared/authenticatedContext.ts";
import { MAX_FILE_BYTES, type FileKind } from "./contract.ts";
const invalid = () => new FunctionHttpError(422, "invalid_file", "O arquivo não é um PDF/XLSX válido ou está corrompido.");
const decoder = new TextDecoder("utf-8", { fatal: true });
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++)
        c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
}
function pdf(bytes: Uint8Array) {
    const first = new TextDecoder("latin1").decode(bytes.subarray(0, 2048)), tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 4096)));
    if (!/^%PDF-(?:1\.[0-7]|2\.0)/.test(first) || !(/%%EOF\s*$/).test(tail))
        throw invalid();
    const match = [...tail.matchAll(/startxref\s+(\d+)\s+%%EOF/g)].at(-1);
    if (!match)
        throw invalid();
    const offset = Number(match[1]);
    if (!Number.isSafeInteger(offset) || offset <= 0 || offset >= bytes.length)
        throw invalid();
    const target = new TextDecoder("latin1").decode(bytes.subarray(offset, Math.min(offset + 2048, bytes.length)));
    if (!/^xref\s/.test(target) && !(/^\d+\s+\d+\s+obj\b/.test(target) && /\/Type\s*\/XRef\b/.test(target)))
        throw invalid();
    if (!/\d+\s+\d+\s+obj\b/.test(new TextDecoder("latin1").decode(bytes)))
        throw invalid();
}
async function xlsx(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), u16 = (n: number) => view.getUint16(n, true), u32 = (n: number) => view.getUint32(n, true);
    if (bytes.length < 22 || u32(0) !== 0x04034b50)
        throw invalid();
    let end = -1;
    for (let n = bytes.length - 22; n >= Math.max(0, bytes.length - 65557); n--)
        if (u32(n) === 0x06054b50 && n + 22 + u16(n + 20) === bytes.length) {
            end = n;
            break;
        }
    if (end < 0 || u16(end + 4) !== 0 || u16(end + 6) !== 0 || u16(end + 8) !== u16(end + 10))
        throw invalid();
    const count = u16(end + 10), central = u32(end + 16);
    if (count < 5 || count > 2048 || central + u32(end + 12) !== end)
        throw invalid();
    const names = new Set<string>(), xml = new Map<string, string>();
    let cursor = central, total = 0;
    for (let n = 0; n < count; n++) {
        if (cursor + 46 > end || u32(cursor) !== 0x02014b50)
            throw invalid();
        const flags = u16(cursor + 8), method = u16(cursor + 10), crc = u32(cursor + 16), compressed = u32(cursor + 20), size = u32(cursor + 24), len = u16(cursor + 28), extra = u16(cursor + 30), comment = u16(cursor + 32), local = u32(cursor + 42);
        if (cursor + 46 + len + extra + comment > end || flags & 1 || ![0, 8].includes(method) || size > MAX_FILE_BYTES || u16(cursor + 34) !== 0 || (u32(cursor + 38) >>> 16 & 0xf000) === 0xa000)
            throw invalid();
        const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + len));
        if (!name || name.startsWith("/") || name.includes("\\") || name.includes("\0") || name.split("/").some(p => p === ".." || p === ".") || names.has(name.toLowerCase()) || /vbaProject|xl\/embeddings\//i.test(name))
            throw invalid();
        names.add(name.toLowerCase());
        if (local + 30 > central || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method)
            throw invalid();
        const localName = u16(local + 26), localExtra = u16(local + 28), start = local + 30 + localName + localExtra;
        if (start + compressed > central || decoder.decode(bytes.subarray(local + 30, local + 30 + localName)) !== name)
            throw invalid();
        if (!(flags & 8) && (u32(local + 14) !== crc || u32(local + 18) !== compressed || u32(local + 22) !== size))
            throw invalid();
        const keep = ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels"].includes(name) || /^xl\/worksheets\/[^/]+\.xml$/.test(name);
        if (keep && size > 8 * 1024 * 1024)
            throw invalid();
        let stream = new Blob([bytes.slice(start, start + compressed)]).stream();
        if (method === 8)
            stream = stream.pipeThrough(new DecompressionStream("deflate-raw"));
        const reader = stream.getReader(), parts: Uint8Array[] = [];
        let actual = 0, checksum = 0xffffffff;
        while (true) {
            const r = await reader.read();
            if (r.done)
                break;
            actual += r.value.length;
            total += r.value.length;
            if (actual > size || total > 64 * 1024 * 1024) {
                await reader.cancel();
                throw invalid();
            }
            for (const b of r.value)
                checksum = crcTable[(checksum ^ b) & 255] ^ (checksum >>> 8);
            if (keep)
                parts.push(r.value);
        }
        if (actual !== size || ((checksum ^ 0xffffffff) >>> 0) !== crc)
            throw invalid();
        if (keep) {
            const result = new Uint8Array(actual);
            let at = 0;
            for (const part of parts) {
                result.set(part, at);
                at += part.length;
            }
            const text = decoder.decode(result);
            if (/<!DOCTYPE|<!ENTITY/i.test(text))
                throw invalid();
            xml.set(name, text);
        }
        cursor += 46 + len + extra + comment;
    }
    if (cursor !== end)
        throw invalid();
    const types = xml.get("[Content_Types].xml") ?? "", root = xml.get("_rels/.rels") ?? "", book = xml.get("xl/workbook.xml") ?? "", rels = xml.get("xl/_rels/workbook.xml.rels") ?? "";
    if (!/<(?:\w+:)?Types\b/.test(types) || !types.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml") || /macroEnabled/i.test(types)
        || !root.includes("officeDocument") || !root.includes("workbook.xml") || !/<(?:\w+:)?workbook\b/.test(book) || !rels.includes("worksheet")
        || ![...xml.entries()].some(([name, text]) => name.startsWith("xl/worksheets/") && /<(?:\w+:)?worksheet\b/.test(text)))
        throw invalid();
}
export async function validateContent(bytes: Uint8Array, kind: FileKind): Promise<string> {
    if (!bytes.length || bytes.length > MAX_FILE_BYTES)
        throw new FunctionHttpError(413, "file_too_large", "O arquivo deve ter até 25 MiB.");
    try {
        if (kind === "pdf")
            pdf(bytes);
        else
            await xlsx(bytes);
    }
    catch (error) {
        if (error instanceof FunctionHttpError)
            throw error;
        throw invalid();
    }
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
