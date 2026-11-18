# WhatsApp channel: design (IFC-035, IFC-036 and their rows)

Status: **plan**. Nothing here is built. `Sprint_plan.csv` is the source of
truth for the rows; this file is the design they point at. Owner ruling
18/11/2026: build **both** transports behind one seam, let the customer pick one
in Settings after a plain-words notice of the differences.

## 1. What the customer gets

A customer's WhatsApp number is connected to Aurora. A message from a customer's
customer lands on that person's lead or contact timeline as **Received**; the
team replies from Aurora and the reply reaches the phone. First demo: West
London Handyman's site planner sends a job enquiry to WhatsApp (prefilled
message), and it arrives in Aurora as a lead with the message on its timeline.

## 2. The two transports, in plain words

|             | A. Meta WhatsApp Cloud API (official)                                                                                                                                       | B. WAHA (unofficial, QR pairing)                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Who runs it | Meta; the customer has a Meta business account and a number                                                                                                                 | An open-source container (NOWEB engine) that Aurora hosts (**verify edition, licence and session limits**)   |
| Setup time  | Days: a number not used in the WhatsApp app, possibly Meta business verification                                                                                            | Minutes: scan a QR code like WhatsApp Web                                                                    |
| Cost        | Replies to a customer-started chat inside 24 h are free; business-started messages need approved templates and are charged per message (**verify the current price table**) | No Meta fees; hosting costs for the container (about 200 MB RAM per session; **verify**)                     |
| Ban risk    | Low when WhatsApp's business rules are followed                                                                                                                             | **Real.** WhatsApp does not allow unofficial clients; the number can be restricted or banned, with its chats |
| Terms       | Allowed: WhatsApp's own business product                                                                                                                                    | **Against WhatsApp's terms of service**; WAHA's own site says it "shouldn't be considered totally safe"      |
| Suits       | A business that wants it to last                                                                                                                                            | A business that accepts the risk to start today                                                              |

Sources: the DeskcommCRM study of 17/11/2026 (section 2: WhatsApp ToS, WAHA's
own site, Cloud API requirements). The Cloud API pricing and window facts were
**not re-checked against Meta's pages**, and the WAHA claims (licence, NOWEB,
per-session API keys, the webhook HMAC header, RAM per session) are the study's,
**unverified**. One open risk: the free edition may allow only **one session**,
with several sessions paid, which would be spend the owner must approve. IFC-322
and IFC-035 state WAHA's edition, licence, session limits and cost from WAHA's
own pages; IFC-035 verifies every fact in this table and dates it before the
Settings notice ships.

## 3. The seam (hexagonal)

A port in `packages/application/src/ports/` (`WhatsAppTransport`) and one
adapter per transport in `packages/adapters/src/messaging/whatsapp/`. Adapters
are **dumb**: parse, sign-check, send. Rules (24-hour window, reply-only,
restrictions, STOP) live in use cases, so both transports obey them.

```ts
export type WhatsAppTransportKind = 'META_CLOUD' | 'WAHA';

export interface WhatsAppTransport {
  readonly kind: WhatsAppTransportKind;
  readonly capabilities: {
    freeTextWindowHours: number | null;
    templates: boolean;
  };
  /** The raw body, the headers and THIS connection's secret. Anything missing or wrong is rejected. */
  verifyWebhook(input: {
    rawBody: string;
    headers: Headers;
    secret: string;
  }): { ok: true } | { ok: false; reason: string };
  /** An authentic body becomes normalised events (messages, status updates); unknown shapes give []. */
  parseWebhook(rawBody: string): WhatsAppEvent[];
  send(connection: ConnectionRef, message: OutboundText): Promise<SendResult>;
  status(connection: ConnectionRef): Promise<ConnectionStatus>; // Meta: token check; WAHA: session state and QR
}
```

Every transport must pass one shared **contract test suite** (IFC-320): a
missing signature, a wrong one, a right one of the wrong length, a replayed
delivery, an unknown shape. A transport without it does not merge (the
`provider-test-exists` gate).

## 4. What not to repeat from DeskcommCRM

1. **Fail-open webhook signature.** They accept a webhook with no signature
   unless a flag is set. Ours is fail-closed in both transports, with no flag:
   no signature, a wrong one or a missing secret is `401` and nothing is stored.
   WAHA signs with a per-session HMAC key that Aurora sets when it creates the
   session; a session whose events arrive unsigned shows "needs attention".
2. **One WAHA API key for every tenant.** Isolation there is hand-written
   filters. Ours: one WAHA **session per tenant, each with its own key**, never
   exposed to the browser or other tenants. Whether that is a container per
   tenant or one container with per-session keys is decided by an ADR and a
   spike with a negative test (IFC-322); if per-session keys are not real, it is
   a container per tenant. The WAHA dashboard and API are never on a public
   address.

## 5. Security rules for the intake

- The tenant comes from the **connection found by the path token**
  (`/api/webhooks/whatsapp/<transport>/<token>`; the token is stored hashed),
  never from the body. For Meta the `phone_number_id` in the verified payload
  must also match that connection.
- Raw body first, then verify, then parse (HMAC over the exact bytes; length
  check before `timingSafeEqual`). The archive stores only **authenticated**
  bodies, encrypted at field level, with a 30-day purge. A rejected delivery
  leaves a reason code and a size, no body (an unauthenticated body archive is a
  storage and PII risk).
- Secrets (access token, app secret, verify token, WAHA key, HMAC key) go in the
  encrypted-field map (`ENCRYPTED_FIELDS`,
  `packages/db/src/field-encryption.ts`) and are shown to the customer once.
- Idempotent: a replayed delivery is a no-op (unique provider message id per
  conversation).
- Privacy: messages honour processing restrictions and objection as the email
  sync does, and are included in the personal-data export and the
  erase-a-person's-communications paths (IFC-316, IFC-317). Group chats and
  status/broadcast messages are ignored, not stored.
- No anti-detection features (spinning, jitter to dodge spam checks). WAHA's own
  advice is the policy: **reply, never start conversations**.

## 6. Flow

Inbound: provider → `POST /api/webhooks/whatsapp/<transport>/<token>` on the API
(raw body, like the Stripe route) → find connection by token → `verifyWebhook` →
archive → `parseWebhook` → ingest use case: match the number to a contact, then
a lead (E.164, UK default region); none → create a lead (rate-limited) → store
the chat message and a lead activity (type `WHATSAPP`, direction `inbound`,
author the sender, no user id) → `200`. Answer fast: the provider retries slow
answers. The API sleeps when idle, so the first webhook after a sleep is slow;
ingest is idempotent, so the retry is safe, and IFC-036 measures it.

Outbound: Aurora's reply box → `whatsapp.send` (tRPC) → send use case:
connection connected, recipient is the conversation's own contact, Meta window
open (else "the 24-hour window is closed", templates are a later row),
restriction/STOP checks → transport → store the outbound message and a lead
activity (direction `outbound`, the sender's user id) → delivery status updates
(sent, delivered, read, failed) arrive by webhook and only move forward.

## 7. Data (additive; one migration, needs the owner's yes at deploy)

- `whatsapp_connections`: tenant, kind, status, display number, hashed webhook
  token, encrypted secrets, Meta ids / WAHA session name, notice version and who
  acknowledged it and when. One live connection per tenant (partial unique
  index).
- `whatsapp_webhook_events`: authenticated raw bodies, encrypted, with a purge
  date.
- `ChatConversation` gets `connectionId` and a unique
  `(tenantId, connectionId, externalId)`; `ChatMessage` gets `externalId`,
  `direction`, `status` and a unique `(conversationId, externalId)`. Both tables
  already exist (FLOW-017). `LeadActivityType` gains `WHATSAPP`.
- Class A (additive, nothing dropped or rewritten), RLS and tenant-isolation
  tests as for every table.

## 8. Settings and the notice

Admin-only page. The customer reads the comparison in section 2 (final wording
reviewed by the owner, facts verified by IFC-035), picks one, and for B ticks "I
understand this is against WhatsApp's terms and my number can be banned"; the
tick, the person, the time and the notice version are recorded. One connection
per tenant: switching disconnects the old one first (messages are kept). A: a
guided form (phone-number id, business account id, token, app secret) that shows
the webhook URL and verify token. B: a QR code and live pairing status.
**Embedded Signup** (Aurora as a Meta Tech Provider) is later and the owner's
decision: it needs Meta app review.

## 9. First demo

The planner on the West London Handyman concept site opens WhatsApp with a
prefilled job message to a **Leangency-owned demo number** (his own number is
connected only after he has read the notice and chosen). The message reaches
Aurora, creates the lead, and shows as **Received**; the owner replies from
Aurora and it reaches the phone. Proven on A (Meta test number or the Leangency
number) and on B (a throwaway number), with real provider responses recorded and
the processing time measured.

## 10. Rows (sprints 24-25)

Each row is 1,500 lines or fewer, tests included. The acceptance criteria are in
`plan-overrides.yaml`.

| Row     | Sprint | What                                                                            |
| ------- | ------ | ------------------------------------------------------------------------------- |
| IFC-320 | 24     | The seam: port, types, fake transport, contract suite                           |
| IFC-321 | 24     | Data model and migration, repositories, purge                                   |
| IFC-322 | 24     | WAHA tenant isolation: ADR-089 and spike, edition and cost stated               |
| IFC-323 | 24     | Inbound webhook route, fail-closed, archive                                     |
| IFC-035 | 25     | Research and verification: facts, costs, a live sandbox proof                   |
| IFC-324 | 25     | Ingest and match: find or create the lead, store, show as Received              |
| IFC-325 | 25     | Transport A: Meta Cloud API                                                     |
| IFC-326 | 25     | Transport B: WAHA adapter, a client bound to one tenant                         |
| IFC-327 | 25     | Reply from Aurora: send use case, tRPC, window rule, status                     |
| IFC-328 | 25     | Connection backend: choose, notice acknowledgement, credentials, disconnect     |
| IFC-329 | 25     | Privacy: restrictions, erasure, export, record of processing and sub-processors |
| IFC-330 | 25     | WAHA session manager: a session, a key and an HMAC key per tenant, QR           |
| IFC-331 | 25     | WAHA deployment: pinned container on the private network, runbook, cost         |
| PG-214  | 25     | Lead and contact pages: the shared WhatsApp thread and reply box                |
| PG-215  | 25     | Settings: choose, the notice, the acknowledgement                               |
| PG-216  | 25     | Settings: connect panels (Meta form, WAHA QR)                                   |
| IFC-036 | 25     | End to end and the first demo                                                   |

IFC-036 keeps the original "under 1s" and refines it: 99.9% of deliveries under
1s, with the first delivery after the API wakes from idle sleep measured
separately.

## 11. Owner steps and open decisions

- **IFC-034** (the £3,000 investment gate) is still the owner's. IFC-035 keeps
  its dependency on it. The build rows do **not** depend on it: his 18/11 ruling
  is to build both, and rows that buy nothing commit no spend. The spend rows
  (IFC-035, IFC-331, IFC-036) carry a spend prerequisite instead. Spend (the
  WAHA container's hosting, a demo number or SIM, Meta's per-message charges)
  needs his yes. If he wants IFC-034 to gate the build too, it is one dependency
  on IFC-320 and IFC-322 and new dates.
- The West London Handyman planner change (a prefilled link to the demo number)
  is in the leangency-portal repository: a prerequisite of IFC-036, not a row
  here.
- Meta business verification, a Meta developer login, the QR scan and a phone
  are **his** steps (identity and codes); the rest is agent work.
- The Settings notice wording and the legal reading of WhatsApp's terms are his
  call.
- Tech Provider and Embedded Signup, message templates and media: later, not in
  these rows.
