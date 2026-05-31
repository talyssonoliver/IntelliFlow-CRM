# packages/webhooks - Inbound Webhook Framework

## Purpose

`@intelliflow/webhooks` is a small, dependency-free framework for receiving and
verifying inbound webhooks (Stripe, GitHub, SendGrid, generic HMAC). Everything
lives in one module, `src/framework.ts`, re-exported by `src/index.ts`.

## Entry Points

- `createWebhookFramework(config?)` -> `WebhookFramework` (register sources,
  handlers, middleware; call `handle()` per request -> `HandleResult`).
- `SignatureVerifiers` - `{ hmacSha256Verify, stripeVerify, githubVerify }`.
- `EventTransformers` -
  `{ defaultEventTransformer, stripeEventTransformer, sendgridEventTransformer }`
  (raw payload -> `WebhookEvent`).

## Contracts (key types in `framework.ts`)

- `WebhookEvent<T>`, `WebhookContext`, `EventHandler<T>`, `Middleware`,
  `SignatureVerifyFn`, `WebhookSourceConfig`, `WebhookFrameworkConfig`,
  `HandleResult`, `FrameworkMetrics`.
- `SignatureVerifyFn = (payload: string, signature: string, secret: string) => boolean`.

## Pitfalls

- Signature verification runs against the **raw request body** - verify before
  any JSON parse/re-serialize, or the HMAC will not match.
- Pick the transformer that matches the source; `defaultEventTransformer` makes
  no provider-specific assumptions.

## Tests

`src/__tests__/` covers verifiers, transformers, and framework dispatch.
