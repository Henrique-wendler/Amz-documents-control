import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const assets = ["LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf", "amazon-agro-logo.jpg", "LICENSE_LIBERATION"];
const assetUrl = (name) => new URL(`../supabase/functions/generate-report/assets/${name}`, import.meta.url);

test("PDF fonts and brand image are present and configured as static files", async () => {
  const [regular, bold, logo, license, config] = await Promise.all([
    ...assets.map((name) => readFile(assetUrl(name))),
    readFile(new URL("../supabase/config.toml", import.meta.url), "utf8"),
  ]);
  for (const font of [regular, bold]) {
    assert.equal(font.readUInt32BE(0), 0x00010000);
    assert.ok(font.length > 100_000);
  }
  assert.equal(logo.readUInt16BE(0), 0xffd8);
  assert.ok(license.length > 0);
  assert.match(config, /\[functions\.generate-report\][\s\S]*?static_files\s*=\s*\["\.\/functions\/generate-report\/assets\/\*"\]/);
});

const zipEntryNames = (buffer) => {
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  assert.ok(end >= 0, "ZIP end-of-central-directory is missing");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const names = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, "ZIP central-directory entry is invalid");
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
};

if (process.env.REPORT_BUNDLE_ZIP) {
  test("downloaded deployment ZIP contains every PDF asset", async () => {
    const names = zipEntryNames(await readFile(process.env.REPORT_BUNDLE_ZIP));
    for (const asset of assets) {
      assert.ok(names.some((name) => name.endsWith(`/assets/${asset}`) || name === `assets/${asset}`),
        `deployed bundle is missing assets/${asset}`);
    }
  });
}

const { REPORT_LOCAL_URL, REPORT_LOCAL_ANON_KEY, REPORT_LOCAL_JWT_SECRET, REPORT_LOCAL_ACTOR_ID } = process.env;
const localSettings = [REPORT_LOCAL_URL, REPORT_LOCAL_ANON_KEY, REPORT_LOCAL_JWT_SECRET, REPORT_LOCAL_ACTOR_ID];
if (localSettings.some(Boolean) && !localSettings.every(Boolean)) {
  throw new Error("Provide all four REPORT_LOCAL_* values for HTTP integration tests.");
}

if (localSettings.every(Boolean)) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    aud: "authenticated", exp: now + 300, iat: now, iss: "supabase", sub: REPORT_LOCAL_ACTOR_ID,
    role: "authenticated", aal: "aal2",
  })}`;
  const token = `${unsigned}.${createHmac("sha256", REPORT_LOCAL_JWT_SECRET).update(unsigned).digest("base64url")}`;
  const invoke = async (body) => {
    const response = await fetch(REPORT_LOCAL_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: REPORT_LOCAL_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, `export failed: ${bytes.toString("utf8", 0, 200)}`);
    assert.ok(bytes.length > 4_096, "export is unexpectedly small");
    assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename="relatorio-/);
    assert.match(response.headers.get("x-report-id") ?? "", /^[0-9a-f-]{36}$/i);
    return { response, bytes };
  };

  for (const [name, body] of [
    ["simple farm PDF", { type: "farms", format: "pdf", filters: {} }],
    ["accented Portuguese PDF", { type: "farms", format: "pdf", filters: { bank: "Fictício · Homologação · Município · Organização" } }],
    ["financial operations PDF", { type: "operations", format: "pdf", includeFinancial: true, filters: {} }],
  ]) {
    test(name, async () => {
      const { response, bytes } = await invoke(body);
      assert.match(response.headers.get("content-type") ?? "", /^application\/pdf\b/);
      assert.equal(bytes.toString("ascii", 0, 5), "%PDF-");
      assert.match(bytes.subarray(-20).toString("ascii"), /%%EOF/);
    });
  }

  test("XLSX still exports with its original MIME", async () => {
    const { response, bytes } = await invoke({ type: "farms", format: "xlsx", filters: {} });
    assert.match(response.headers.get("content-type") ?? "", /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\b/);
    assert.equal(bytes.toString("ascii", 0, 2), "PK");
  });
}
