import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifiedJwtHasAal2 } from "../supabase/functions/_shared/verifiedJwtAal.ts";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const tokenWithClaims = (claims) => `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.signature`;

test("verified JWT AAL helper accepts only aal2 and fails closed", () => {
  assert.equal(verifiedJwtHasAal2(tokenWithClaims({ aal: "aal2" })), true);
  for (const claims of [{ aal: "aal1" }, { aal: "aal3" }, {}, { aal: 2 }]) {
    assert.equal(verifiedJwtHasAal2(tokenWithClaims(claims)), false);
  }
  assert.equal(verifiedJwtHasAal2("malformed"), false);
  assert.equal(verifiedJwtHasAal2("a.!!!.b"), false);
});

test("user Edge Functions validate the exact JWT before reading its AAL", async () => {
  for (const name of ["admin-users", "document-files", "generate-report"]) {
    const source = await readFile(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), "utf8");
    const verifiedAt = source.indexOf("auth.getUser(token)");
    const checkedAt = source.indexOf("verifiedJwtHasAal2(token)");
    assert.ok(verifiedAt >= 0 && checkedAt > verifiedAt, `${name} must check AAL after Auth validates the same token`);
    assert.match(source.slice(checkedAt, checkedAt + 170), /mfa_required/);
  }
});

const { MFA_LOCAL_URL, MFA_LOCAL_ANON_KEY, MFA_LOCAL_JWT_SECRET, MFA_LOCAL_ACTOR_ID } = process.env;
const localSettings = [MFA_LOCAL_URL, MFA_LOCAL_ANON_KEY, MFA_LOCAL_JWT_SECRET, MFA_LOCAL_ACTOR_ID];
if (localSettings.some(Boolean) && !localSettings.every(Boolean)) {
  throw new Error("Provide all four MFA_LOCAL_* values for HTTP integration tests.");
}

if (localSettings.every(Boolean)) {
  const sign = (aal) => {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
      aud: "authenticated", exp: now + 300, iat: now, iss: "supabase", sub: MFA_LOCAL_ACTOR_ID,
      role: "authenticated", aal,
    })}`;
    return `${unsigned}.${createHmac("sha256", MFA_LOCAL_JWT_SECRET).update(unsigned).digest("base64url")}`;
  };
  const cases = [
    ["admin-users", { action: "list" }, 200],
    ["document-files", { action: "download", locationId: "invalid" }, 400],
    ["generate-report", { type: "unknown", format: "pdf" }, 400],
  ];
  for (const [name, body, aal2Status] of cases) {
    test(`${name} rejects aal1 and passes aal2 to its normal authorization flow`, async () => {
      const invoke = async (aal) => {
        const response = await fetch(`${MFA_LOCAL_URL.replace(/\/$/, "")}/${name}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sign(aal)}`,
            apikey: MFA_LOCAL_ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const payload = await response.json();
        return { status: response.status, code: payload.code };
      };
      assert.deepEqual(await invoke("aal1"), { status: 403, code: "mfa_required" });
      const aal2 = await invoke("aal2");
      assert.equal(aal2.status, aal2Status, `${name} did not reach its normal aal2 path (${aal2.code})`);
      assert.notEqual(aal2.code, "mfa_required");
    });
  }
}
