# WhatsApp API research: both transports, costs, terms, sandbox proof (IFC-035)

- **Task:** IFC-035 (PHASE-006). Feeds IFC-324 to IFC-331 and IFC-036.
- **Date of research:** 2026-11-22. Every fact below carries the page it came
  from and the date it was read. Pages were read through a summarising fetch
  tool, so numbers that matter were checked a second way where possible (stated
  per row). Anything not read is marked **NOT VERIFIED**, never filled in.
- **Related:** `docs/architecture/whatsapp-channel-design.md`,
  `docs/architecture/adr/ADR-089-waha-tenant-isolation.md` (accepted by the
  owner 2026-11-21),
  `packages/application/src/ports/external/WhatsAppTransportPort.ts` (IFC-320),
  `docs/shared/integration-design.puml`, `artifacts/reports/cost-analysis.xlsx`,
  `artifacts/misc/poc-results.json`.

## 1. Result in one page

| Question                                     | Transport A: Meta Cloud API                                                                  | Transport B: WAHA                                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is it feasible for Aurora?                   | Yes, on paper. **Live proof PENDING** (needs the owner's Meta login).                        | Yes. **Proven live locally** (session reaches `SCAN_QR_CODE`, signed webhook delivered, raw-body route checked). Pairing a real number was not done, by rule. |
| Main risk                                    | Cost and process: per-message charges, template approval, number rules, display-name review. | **Ban.** WhatsApp does not allow unofficial clients; the number can be restricted or banned with its chats.                                                   |
| Cost, 1 / 10 / 100 customers (see section 7) | About £0.32 / £3.18 / £31.80 per month at the stated usage assumption                        | About $5.39 / $23.39 / $203.39 per month hosting (assumes 200 MB per paired session, unverified)                                                              |
| Terms                                        | Allowed: WhatsApp's own business product, under the Business Messaging Policy.               | Against WhatsApp's terms (section 5).                                                                                                                         |

Two findings change the design doc: (1) replies inside the 24-hour window are
**no longer all free**: from 1 October 2026 service messages are charged after
1,000 free per business number per month (section 3); (2) WAHA has no paid
edition any more; Core is Apache-2.0 and includes the former Plus features
(confirms ADR-089, section 4).

## 2. Meta WhatsApp Cloud API (transport A)

### 2.1 Pricing and categories

Source: developers.facebook.com/docs/whatsapp/pricing (read 2026-11-22), and the
GBP rate files linked from it.

| Fact                                                              | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model                                                             | Per delivered business-to-user message since 1 July 2025. User-to-business messages are never charged.                                                                                                                                                                                                                                                                                                                                                           |
| Categories                                                        | Template messages: **marketing, utility, authentication**. Non-template (free text) messages: **service** (and Meta Business Agent), only inside an open 24-hour window.                                                                                                                                                                                                                                                                                         |
| UK rates, GBP per delivered message, **effective 1 October 2026** | Marketing **£0.0458**; utility **£0.0159**; authentication **£0.0159**; service **£0.0159**. Source: "GBP list rates" file, row United Kingdom, read 2026-11-22. The UK is a standalone rate-card market.                                                                                                                                                                                                                                                        |
| Volume tiers                                                      | Utility and authentication only. The UK list rate applies up to 100,000 utility and 300,000 authentication messages a month: no discount at our scale ("GBP volume tiers" file).                                                                                                                                                                                                                                                                                 |
| Free                                                              | 1,000 delivered service messages per business phone number per month (no roll over; from 1 October 2026). Free entry point window: replies within up to **7 days** after a user messages from a Click to WhatsApp ad (the older "72 hours" figure is out of date). Utility messages inside the 24-hour window were free until 30 September 2026 and are **charged from 1 October 2026**. Eligible governments and non-profits: service free to 31 December 2027. |
| Dated changes                                                     | 1 Oct 2026: service and in-window utility become charged, 40 rates updated. 1 Jul 2026: the UK marketing rate rose. 1 Nov 2024: service conversations had been free.                                                                                                                                                                                                                                                                                             |
| Platform or partner fee                                           | None stated on the pricing page. **NOT VERIFIED** for partners (BSPs); we use the direct Cloud API.                                                                                                                                                                                                                                                                                                                                                              |

The pricing page is undated in its body; the GBP files state "effective October
1, 2026".

### 2.2 The 24-hour window and templates

Sources: `.../messages/send-messages` and `.../templates/overview` (read
2026-11-22).

- "When a WhatsApp user messages you or calls you, a 24-hour timer called a
  customer service window starts." A new message or call from the user resets it
  to 24 hours.
- Inside the window any message type may be sent. Outside it, "template messages
  are the only type of message that can be sent". Aurora's send use case must
  refuse free text when the window is closed (design doc section 6).
- Templates: categories authentication, marketing, utility. Reviewed
  automatically; the dashboard says review "can take up to 24 hours". Only
  `APPROVED` templates can be sent. Quality rating (pending, high, medium, low);
  recurring negative feedback or low read rates **pause** or **disable** a
  template.
- Limits: 100 template creations per Messaging account per hour; 250 templates
  in total for an unverified portfolio, 6,000 for a verified one with an
  approved display name. Templates inactive 12+ months are archived.
- The error code returned for a closed window was **not on the pages read** (NOT
  VERIFIED); the live proof or IFC-325 must record it.

### 2.3 Rate limits and messaging limits

Source: `.../cloud-api/overview` and `.../messaging-limits` (read 2026-11-22).

- Throughput: up to **80 messages per second** per business number by default.
- API requests: 200 per hour per app per Messaging account by default, **5,000**
  once at least one number is registered.
- Pair rate: one message every 6 seconds to the same user (error `131056`);
  burst up to 45 in 6 seconds. Retry failed sends after 4^X seconds (X from 0).
- Messaging limit (unique users contacted **outside** a service window in 24
  hours, per business portfolio): **250** for a new portfolio; **2,000** after
  business verification (or 2,000 delivered template messages to unique numbers
  in 30 days at high quality); then 10,000, 100,000, unlimited automatically.
  Replying inside a window does not count against it. Aurora's reply-only design
  stays well inside the starting tier.

### 2.4 Setup, numbers, display name and verification

Sources: `.../get-started`, `.../business-phone-numbers/phone-numbers`,
`.../display-names`, Meta Business Help Centre "Display name guidelines for the
WhatsApp Business Platform" (all read 2026-11-22).

Steps (get-started page): Facebook or managed Meta account and developer
registration; a business portfolio; create an app with the WhatsApp use case;
connect a Messaging account; a **test number is created automatically**; send a
test message with a temporary token; set up a webhook; create a system user and
a permanent token (permissions `business_management`,
`whatsapp_business_messaging`, `whatsapp_business_management`); open the 24-hour
window by replying to the test message.

- **Setup time:** Meta states no duration anywhere we read. We do not quote
  "days". The sandbox part needs only the owner's login and a phone (section 9);
  a production number additionally needs the number rules below, a display name
  and, to leave the 250 limit, business verification.
- **Number rules:** the number must be yours, with a country and area code, able
  to receive an SMS or voice code. A number that is active in the WhatsApp app
  cannot be registered until it is deleted there. Landlines are allowed (voice
  code recommended). Registration needs a two-step PIN and the `register` call;
  adding the number in the dashboard alone does not register it for the Cloud
  API.
- **Display name:** required for a business number; reviewed (statuses
  `APPROVED`, `PENDING_REVIEW`, `DECLINED`, ...). It must follow the Business
  Messaging Policy, represent the business accurately, not be a generic term or
  location, not contain "Official" or "Verified", not mention Meta or its apps,
  contain no promotional language, not be formatted as a URL or e-mail address,
  and have a clear relationship to the legal business name and to branding on
  external sources. A **test or demo** display name must still show an
  association with the business. Up to 10 changes per 30 days; after approval
  re-register within 14 days.
- **Business verification:** it is one of the three ways to reach the 2,000
  limit (messaging-limits page). The Help Centre article on documents and review
  time returned only its title: **documents and review time NOT VERIFIED**. This
  is an owner step with his identity documents either way.
- **Test resources:** relaxed limits, and no payment method is needed to send
  template messages. How many recipients a test number allows, and whether it is
  free in all cases, is **NOT VERIFIED** on the pages read; the sandbox proof
  will show it.

### 2.5 Webhooks

Source: `.../webhooks/overview` (read 2026-11-22).

- Meta retries with decreasing frequency for up to **7 days** when the endpoint
  answers anything other than 200; duplicates are possible. Payloads up to 3 MB.
  Optional mutual TLS. Some webhooks are not sent while the app is in Dev mode.
- The signature header and verification handshake are **not on the page read**.
  Design assumption, to be confirmed by the live proof (`--verify` mode):
  `X-Hub-Signature-256: sha256=<HMAC-SHA256(app secret, raw body)>` and the
  `hub.challenge` / `hub.verify_token` handshake. The self-test in
  `infra/whatsapp-meta/sandbox-proof.mjs` covers the code, not Meta (labelled
  SIMULATED).

### 2.4a Business Messaging Policy

Source: whatsappbusiness.com/policy ("Last updated: September 23, 2026"; read
2026-11-22). Contact people only with **opt-in permission**, the business being
solely responsible for its opt-in method. Automation is allowed inside the
24-hour window but needs a clear route to a human. Prohibited uses include
regulated goods (tobacco, gambling, payday loans and others) and sharing one
customer's chat with another. Enforcement: significant negative feedback or
violations can limit or remove access; accounts may be terminated.

### 2.5a Risk of transport A

Low ban risk when the policy is followed. The real risks are: cost creep once
past 1,000 free replies per number; template rejection or pausing; the
display-name review; Meta's business verification being the owner's identity
step; and rate-card changes (the pricing page lists changes every quarter).

## 3. What changes in the design doc

| Design doc says                                           | Verified fact                                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| "Replies to a customer-started chat inside 24 h are free" | Free only up to 1,000 service messages per number per month; then £0.0159 each (from 1 Oct 2026). User messages are free. |
| "Templates charged per message (verify the price table)"  | UK: marketing £0.0458, utility £0.0159, authentication £0.0159.                                                           |
| WAHA "about 200 MB RAM per session; verify"               | Still **unverified**: no real number was paired. Idle container 321.9 MiB, about 8.9 MiB per unpaired session (ADR-089).  |
| WAHA "free edition may allow one session only"            | False. Core has no session limit stated; Plus features are in the free image (section 4).                                 |

## 4. WAHA (transport B)

Sources: github.com/devlikeapro/waha, waha.devlike.pro (home),
`/docs/how-to/security/`, `/docs/how-to/events/` (read 2026-11-22); ADR-089
(read 2026-11-21) plus the live container.

| Fact                | Finding                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Licence             | **Apache-2.0** (repository page, 7.9k stars). Site: "100% free and open source", "no license expiration". Commercial use and hosting for customers are allowed; keep the licence notice.                                                                                                                                                  |
| Editions            | One free image (`devlikeapro/waha`); the README says WAHA Plus is part of it and "all Plus features are included". The only paid thing is an optional **Community** support tier ("$5/mo" on Patreon, Boosty or crypto), described as support, not a licence. Not needed. The running container reports `"tier":"CORE","engine":"NOWEB"`. |
| Sessions            | Site: run 1 session and "scale it to 500 sessions". No cap stated; our container ceiling is set by memory, measured in IFC-331.                                                                                                                                                                                                           |
| Engines             | WEBJS and WPP (browser based), NOWEB (Node.js websocket), GOWS (Go websocket). We pin NOWEB.                                                                                                                                                                                                                                              |
| API keys            | `X-Api-Key` header. Admin keys reach all sessions; session keys are scoped to one session; `actions` limits a session key. "Do not expose WhatsApp API on public networks!"                                                                                                                                                               |
| Webhook signature   | Set `config.hmac.key` on the session. Headers `X-Webhook-Hmac` (HMAC of the raw body) and `X-Webhook-Hmac-Algorithm: sha512`. **Verified live** (section 6).                                                                                                                                                                              |
| Webhook retries     | Configurable per webhook (`constant`, `linear`, `exponential`; `delaySeconds`, `attempts`); default not stated. The live log showed retries ("Retrying 1/15") when the receiver was unreachable.                                                                                                                                          |
| Statement on safety | "WhatsApp does not allow bots or unofficial clients on their platform, so this shouldn't be considered totally safe." (waha.devlike.pro home, "No blocking".)                                                                                                                                                                             |
| Tenant isolation    | Proven 2026-11-21: 21 cross-tenant calls with one tenant's session key, 0 succeeded (ADR-089).                                                                                                                                                                                                                                            |

## 5. WhatsApp's terms on unofficial transports (read 2026-11-22)

- **WhatsApp Terms of Service** (whatsapp.com/legal/terms-of-service; the page
  body states "Effective Date: January 4, 2021"; the UK and EEA text may differ,
  **NOT VERIFIED**): users must not, "directly or through automated means", gain
  or attempt to gain unauthorized access to the Services; must not "create
  accounts for our Services through unauthorized or automated means"; must not
  reverse engineer or "create software or APIs that function substantially the
  same as our Services" for third parties; the legal-use clause bars "bulk
  messaging, auto-messaging, auto-dialing, and the like"; and WhatsApp "may
  modify, suspend, or terminate your access to or use of our Services anytime
  for any reason". The phrase "unofficial client" does not appear.
- **Business Messaging Policy** (above): a service using WhatsApp in violation
  of the terms, such as "messaging people at scale in an unauthorized manner",
  may lose access.
- **WhatsApp Business Platform terms**: the legal page did not load (404 and a
  redirect with no text). **NOT VERIFIED**; the owner's reading of the terms is
  his call (design doc section 11).
- **Reading:** transport B drives a personal or business WhatsApp account
  through an unofficial implementation of WhatsApp Web. It is not a permitted
  API. WhatsApp can suspend that number at any time, without notice, and the
  chats with it. This is a contractual and operational risk to the **customer's
  number**, which is why the customer must tick the notice (PG-215) and why
  Aurora only replies and never starts conversations, sends no bulk messages and
  adds no anti-detection features.
- **Not covered by the research:** UK data-protection and PECR duties for the
  customer's messaging (IFC-329).

### Risk statement per transport

|        | Risk                                                                                                                                                           | Who bears it                                        | Mitigation in the design                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Meta | Cost; template and display-name rejections; Meta verification; quarterly price changes                                                                         | Customer (per-message charges) and Aurora (support) | Reply-only keeps usage in the free tier; show the price table in Settings; re-check the rate card each quarter                                    |
| B WAHA | **Number ban or restriction, loss of chats; terms violation; WAHA runs a real WhatsApp Web session that can break on WhatsApp updates; shared container fate** | **Customer's number**; Aurora's availability        | Plain-words notice and tick (PG-215); reply-only; one session key per tenant; pin by digest; no public address; fall back to container per tenant |

## 6. Live sandbox proof

Machine-readable results: `artifacts/misc/poc-results.json` (merged from
`waha-sandbox-proof.json` and `meta-sandbox-proof.json`). Rules followed:
nothing invented; no real number paired; no account created.

### 6.1 WAHA: PROVED locally (2026-11-22)

`node infra/waha/sandbox-proof.mjs` starts `devlikeapro/waha:noweb-2026.10.1`
(digest-pinned) from `infra/waha/compose.yaml`, bound to `127.0.0.1`, with a
random admin key made at run time (no key in any file), a second compose file
`infra/waha/compose.proof.yaml` that only adds `host.docker.internal`, and a
**local fake receiver** standing in for the API route. Result, all checks
passed:

| Check                               | Result                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version, edition, engine            | WAHA 2026.10.1, tier CORE, engine NOWEB                                                                                                                                                                                                                                                                                             |
| Port binding                        | `127.0.0.1` only                                                                                                                                                                                                                                                                                                                    |
| Session status                      | Created (201), reached **`SCAN_QR_CODE`**, not paired (`me` is null)                                                                                                                                                                                                                                                                |
| Pairing QR endpoint                 | 200, `image/png`, about 5.3 KB. The image was **not stored** (a QR is a pairing credential).                                                                                                                                                                                                                                        |
| Real webhooks from WAHA to the fake | 2 delivered and accepted: `session.status` `STARTING`, then `SCAN_QR_CODE`, each with `X-Webhook-Hmac` (128 hex) and `X-Webhook-Hmac-Algorithm: sha512`                                                                                                                                                                             |
| Raw-body route, WAHA's own bytes    | Authentic: 200. Replay of an authentic delivery: 200 (idempotency belongs to ingest, IFC-324). One byte added: 401. No header: 401. Wrong key: 401. Wrong-length signature: 401. Wrong algorithm header: 401. **Body pretty-printed before verifying: 401** (why the route must hash the bytes it received). Wrong path token: 404. |
| Clean up                            | Compose down with volume; no container left (checked by name)                                                                                                                                                                                                                                                                       |

The fake receiver listens on `0.0.0.0` for about 30 seconds because the
container reaches the host through the Docker host gateway; it answers only a
random path token and fails closed on the HMAC. Narrow it with `RECEIVER_HOST`.
This is a local stand-in, **not** the production route: the real route and
adapter are IFC-323 and IFC-326.

### 6.2 Meta Cloud API: **PENDING** (one owner step)

Checked on this machine: `.env.local` holds no WhatsApp, Meta, WABA, Graph or
WAHA variable (names only were listed; no value was read or printed). So no test
number or token exists and none was created: creating a Meta developer account
is the owner's step.

`node infra/whatsapp-meta/sandbox-proof.mjs` ran and recorded `PENDING` with the
four missing variable names. Its offline SIMULATED self-test of the signature
algorithm passed (6 of 6); that proves the verification code, **not** Meta.

**The one owner step:** log in at developers.facebook.com, create an app with
the WhatsApp use case, open **API Setup**, add his own phone as a recipient, and
hand the four values to the run environment (`META_WA_ACCESS_TOKEN`,
`META_WA_PHONE_NUMBER_ID`, `META_WA_RECIPIENT_E164`, `META_WA_APP_SECRET`;
optionally `META_GRAPH_VERSION`). Then run the script: it reads the number
(display name status, quality, limit tier), sends the `hello_world` template to
his phone, and with `--verify <rawBodyFile> <header>` checks a captured
webhook's signature. It records the closed-window error code and the test
recipient limit, two facts left **NOT VERIFIED** above. Cost of the proof: £0
(test number, template, no payment method per Meta's overview).

## 7. Costs for 1, 10 and 100 customers

Model and formulas: `artifacts/reports/cost-analysis.xlsx` (yellow cells are
assumptions). Rates are sourced above; the usage figures are assumptions: 300
free-text replies and 20 utility templates per customer per month, no marketing,
one number per customer.

| Customers | A: Meta, GBP / month | Per customer | B: WAHA hosting, USD / month | Per customer |
| --------- | -------------------- | ------------ | ---------------------------- | ------------ |
| 1         | £0.32                | £0.32        | $5.39                        | $5.39        |
| 10        | £3.18                | £0.32        | $23.39                       | $2.34        |
| 100       | £31.80               | £0.32        | $203.39                      | $2.03        |

- A: the 300 replies sit inside each number's 1,000 free; the cost is the 20
  utility templates at £0.0159. Sensitivity: at five times the replies (1,500
  per customer) the cost is £8.27, £82.68 and £826.80, because the free tier is
  per number and then £0.0159 applies.
- B: Railway memory $10 per GiB per month, CPU $20, volume $0.15 (ADR-089, read
  2026-11-21); idle container 0.3219 GiB measured; **0.2 GiB per paired session
  is an unverified assumption**, so the per-tenant figure could move either way
  until IFC-331 measures a paired session. No Meta fee applies, the exposure is
  the ban.
- Not included: the Railway plan fee (Hobby $5 with $5 included; Pro $20 with
  $20 included, per workspace), a number or SIM, partner fees, and the unpriced
  cost of a ban. Meta is priced in GBP and Railway in USD; the workbook keeps
  each in its own currency and applies no exchange rate.
- Spend needs the owner's yes (IFC-034 ruling); this row buys nothing.

## 8. Integration approach

See `docs/shared/integration-design.puml`. Decision: **the API's raw-body
webhook route replaces the Supabase-webhook idea.** The route
`POST /api/webhooks/whatsapp/<transport>/<token>` reads the exact bytes, finds
the connection by the hashed path token, verifies the HMAC (fail closed), stores
only authenticated bodies, parses, and answers fast. A Supabase database webhook
would fire only after a row exists, so the body would be stored and parsed
before authentication, and the tenant would not come from a verified path token.
Implementation note from the live proof: pass the received **bytes** to
`verifyWebhook`; the existing Stripe route decodes the body with
`toString('utf8')` first, which is acceptable there but is not for an HMAC over
a body that may not be valid UTF-8.

## 9. Sources and dates (all read 2026-11-22 unless stated)

- Meta pricing: https://developers.facebook.com/docs/whatsapp/pricing and its
  GBP list-rate and volume-tier files.
- Meta Cloud API overview, messaging limits, send messages, templates, phone
  numbers, display names, webhooks, get started:
  `https://developers.facebook.com/documentation/business-messaging/whatsapp/...`
- Display name guidelines:
  https://www.facebook.com/business/help/757569725593362
- Business Messaging Policy: https://whatsappbusiness.com/policy/ (last updated
  2026-09-23 per the page)
- WhatsApp Terms of Service: https://www.whatsapp.com/legal/terms-of-service
- WAHA: https://github.com/devlikeapro/waha, https://waha.devlike.pro/,
  https://waha.devlike.pro/docs/how-to/security/,
  https://waha.devlike.pro/docs/how-to/events/
- Railway prices and the WAHA measurements: ADR-089 (2026-11-21);
  `artifacts/misc/waha-isolation-spike.json`.

## 10. Open items (not verified, with the row that closes each)

1. Meta business verification documents and review time (owner, during his Meta
   setup; IFC-325).
2. Error code for a free-text send outside the window; test-number recipient
   limit (Meta proof, section 6.2).
3. Meta webhook signature header and handshake as stated by Meta (Meta proof,
   `--verify`).
4. WhatsApp Business Platform terms page and the UK/EEA ToS text (owner's legal
   reading).
5. WAHA memory of a paired session and the container ceiling (IFC-331, needs a
   throwaway number).
6. Partner (BSP) fees, if Aurora ever becomes a Tech Provider with Embedded
   Signup (later row).
