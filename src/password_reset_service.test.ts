import assert from "node:assert/strict";
import { requestCreatorPasswordReset } from "./password_reset_service.ts";

const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const path = new URL(url).pathname;
  calls.push({ path, body: JSON.parse(String(init?.body)) });
  return new Response(JSON.stringify({ ok: true, data: { accepted: true } }), { status: 200, headers: { "content-type": "application/json" } });
};
process.env.INFRAI_API_KEY = "test-key";
const result = await requestCreatorPasswordReset({ email: "creator@example.com", captchaToken: "captcha", widgetRecordId: "widget-record" });
assert.deepEqual(result, { accepted: true, email: "creator@example.com" });
assert.equal(calls[0].path, "/v1/captcha/verify");
assert.equal(calls[0].body.widget_record_id, "widget-record");
assert.equal(calls[1].path, "/v1/auth/password/reset_request");
assert.equal(calls[1].body.email, "creator@example.com");
globalThis.fetch = originalFetch;
console.log("password reset decision test passed");
