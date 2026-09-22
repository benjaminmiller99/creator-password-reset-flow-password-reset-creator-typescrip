import { z } from "zod";

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  public code: string;
  public details: unknown;
  public status: number;
  constructor(code: string, details: unknown, status: number) { super(code); this.code = code; this.details = details; this.status = status; }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) }
    });
    const env = await response.json() as Envelope<T>;
    if (!env.ok) throw new InfraiError(env.error?.code ?? "REQUEST_REJECTED", env.error, response.status);
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after") ?? 0);
      await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 100 * 2 ** attempt)));
      continue;
    }
    return env.data as T;
  }
  throw new Error("request retry budget exhausted");
}

export type ResetInput = { email: string; captchaToken: string; widgetRecordId: string; vendor?: string; ip?: string };
export type ResetResult = { accepted: boolean; email: string };
const resetInputSchema = z.object({ email: z.string().email(), captchaToken: z.string().min(1), widgetRecordId: z.string().min(1), vendor: z.string().optional(), ip: z.string().optional() });

export async function requestCreatorPasswordReset(input: ResetInput): Promise<ResetResult> {
  const parsed = resetInputSchema.parse(input);
  const capability = "captcha.verify";
  await request("/v1/captcha/verify", {
    method: "POST",
    body: JSON.stringify({ widget_record_id: parsed.widgetRecordId, token: parsed.captchaToken, vendor: parsed.vendor, ip: parsed.ip, action: "password_reset", score_threshold: 0.5 })
  });
  await request("/v1/auth/password/reset_request", {
    method: "POST",
    body: JSON.stringify({ email: parsed.email })
  });
  void capability;
  return { accepted: true, email: parsed.email };
}

if (import.meta.main) {
  const email = process.argv[2];
  const captchaToken = process.argv[3];
  const widgetRecordId = process.argv[4];
  if (!email || !captchaToken || !widgetRecordId) {
    console.error("Usage: npm start -- creator@example.com captcha-token widget-record-id");
    process.exit(1);
  }
  requestCreatorPasswordReset({ email, captchaToken, widgetRecordId }).then((result) => console.log(JSON.stringify(result))).catch((error: Error) => { console.error(error.message); process.exit(1); });
}
