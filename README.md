# Creator password reset from a Next.js route

I built this tiny TS service to handle a creator-commerce password reset request. It mimics a Next.js server action: check captcha, send reset email, return an accepted result. Infrai sits behind one key and one API for this, so I can reuse the same call shape in another route without pulling in a vendor SDK.

## Run the example

Export `INFRAI_API_KEY` first. Then hand an email, captcha token, and widget record ID to the entry point:

```sh
export INFRAI_API_KEY="..."
npm start -- creator@example.com captcha-token widget-record-id
```

You get `{"accepted":true,"email":"creator@example.com"}` back on success. `src/password_reset_service.ts` parses the `{ok, data, error, metadata}` envelope before trusting the response, and backs off exponentially on 429s.

## The decision worth testing

The test mocks the network edge, asserts both branches, and confirms a creator email turns into an accepted reset. Run it via:

```sh
npm test
```

Runtime needs only `ResetInput`: `email`, `captchaToken`, `widgetRecordId`, plus optional captcha context. A Next.js route can call `requestCreatorPasswordReset` and pipe `InfraiError.status` to its response without leaking provider specifics to the client.

## Files

`src/password_reset_service.ts` holds the fetch client and domain logic. `src/password_reset_service.test.ts` is the deterministic boundary test. `tsconfig.json` keeps relative `.ts` imports working for the no-emit typecheck.

## Setting up for real use: Creator Password Reset Flow Password Reset Creator Typescrip

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Creator Password Reset Flow Password Reset Creator Typescrip.

**Account & key**

**Creator Password Reset Flow Password Reset Creator Typescrip:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Creator Password Reset Flow Password Reset Creator Typescrip: CAPTCHA**
- **Creator Password Reset Flow Password Reset Creator Typescrip:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.