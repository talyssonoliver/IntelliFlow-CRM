# Vendor DPA Register

[DRAFT — research and documentation only, not legal advice. This register
records what each vendor's own currently-published terms say, as read on
2026-10-12. It does not record that any agreement has been signed, accepted, or
countersigned on Leangency's behalf — see "Owner actions" at the end for the
handful of account-level steps that genuinely need the owner, and why no code,
UI, settings, or feature was added to the CRM to produce this.]

## Purpose and scope

This is foundational SaaS-compliance research, not a product change: **no code,
UI, settings, or feature was added to IntelliFlow CRM to produce this
register.** It exists to answer, for every sub-processor confirmed live in
`docs/shared/dpa-content.md` ("Sub-processors"), three questions from each
vendor's own current published terms:

- **(a) Acceptance** — is the vendor's DPA incorporated automatically into the
  terms the account already accepted, or does it need a separate acceptance,
  signature, or opt-in, and exactly where?
- **(b) Tier** — does the DPA apply on the plan/tier actually in use? Where this
  can't be told from an environment-variable name or public docs, that is stated
  rather than assumed — the Vercel Hobby-plan finding earlier in this issue is
  exactly the kind of gap a silent assumption would miss.
- **(c) UK transfer mechanism** — which safeguard the vendor names for a
  restricted transfer out of the UK (UK IDTA, UK Addendum to the EU SCCs, or the
  UK Extension to the EU-U.S. Data Privacy Framework).

Method: public vendor terms/docs only, read on 2026-10-12, cited by URL, quoted
only in short phrases. No vendor account, dashboard, or billing console was
logged into to produce this register — where a fact requires that (e.g. "has
this DocuSign actually been signed for our account"), it is left as an owner
action, not guessed.

## Register

| Sub-processor                      | (a) Acceptance                                                            | (b) Applies on our tier?                                                                                      | (c) UK mechanism                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Inc.                        | Automatic on entering the Agreement                                       | **No** — confirmed Hobby; DPA covers Pro/Enterprise only                                                      | "UK IDTA" (Vercel's own naming)                                                                                                                           |
| Railway Corporation                | **Manual** — DocuSign form, countersigned by Railway                      | Can't tell from public docs whether plan-gated; no Railway-side tier restriction found in the DPA text itself | UK Addendum (UK SCCs, ICO template)                                                                                                                       |
| Supabase, Inc.                     | Automatic on accepting the Terms of Service                               | Yes — the DPA text names no plan/tier restriction at all                                                      | Approved/UK Addendum (ICO template B.1.0)                                                                                                                 |
| Resend, Inc.                       | Automatic on entering the agreement                                       | Yes — no plan restriction found                                                                               | UK SCCs (EU SCCs + UK Addendum)                                                                                                                           |
| Twilio Inc.                        | Automatic, forms part of the agreement                                    | Yes — no plan restriction found                                                                               | UK IDTA (version B1.0)                                                                                                                                    |
| Functional Software, Inc. (Sentry) | **Manual** — electronic accept/opt-in                                     | Can't tell from public docs whether plan-gated                                                                | UK Extension to EU-U.S. DPF, falling back to the UK Addendum (B1.0)                                                                                       |
| Upstash, Inc.                      | Automatic, incorporated into the Terms of Service                         | Yes — no plan restriction found                                                                               | UK Transfer Addendum (ICO template B.1.0)                                                                                                                 |
| Google LLC (Gemini Developer API)  | Automatic in substance — see "Gemini tier finding" below                  | Yes, regardless of paid/free quota — see below                                                                | UK Extension to EU-U.S. DPF (certified since 14 Sept 2023)                                                                                                |
| OpenRouter, Inc.                   | **Not available at all on our tier** — see "OpenRouter suitability" below | **No** — signed DPA is Exhibit A to the Enterprise Access Agreement only                                      | Self-serve: EU SCCs under GDPR Art. 46, no UK-specific instrument named. Enterprise-only Exhibit A: names a UK Addendum, but this account doesn't have it |

## Per-vendor detail

### Vercel Inc.

- DPA: https://vercel.com/legal/dpa (updated 17 March 2026, effective 31 March
  2026). Text: "This Addendum applies to Vercel's Processing of Personal Data as
  a Processor... for Customers who are on Enterprise and Pro plans."
- Already verified earlier in this issue: this project's team is on Hobby
  (`vercel api /v2/teams/<id>` → `billing.plan: "hobby"`). Vercel's own Terms of
  Service restrict Hobby to "personal or non-commercial use"
  (https://vercel.com/legal/terms, §4), and Aurora is commercial use.
- Self-serve upgrade path exists: dashboard → team Settings → Billing → upgrade
  to Pro (https://vercel.com/docs/plans). No DPA exists for this processing
  until that upgrade happens (or hosting moves elsewhere).

### Railway Corporation

- DPA: https://railway.com/legal/dpa. Text: "To complete this DPA, Customer must
  complete the information requested and submit the DocuSign form available
  [here]... This DPA will become legally binding upon Company's execution" —
  i.e. Railway's own countersignature, not a self-serve toggle.
- UK mechanism: the UK Addendum (ICO template referencing "2 February 2022").
- The DPA text itself names no plan/tier restriction, but since the acceptance
  step is a DocuSign exchange rather than a dashboard setting, whether it has
  been requested and countersigned for this account can only be confirmed by
  checking the Railway account itself — an owner action (see below), not
  something derivable from public docs or environment-variable names.

### Supabase, Inc.

- DPA: https://supabase.com/legal/dpa (Version 1, 1 August 2026). Text:
  "supplements and forms part of the Supabase Terms of Service"; "acceptance of
  the Agreement shall have the same effect as signing the SCCs." Automatic — no
  separate step, and no plan/tier language in the DPA at all.
- UK mechanism: "the template addendum, version B.1.0 issued by the UK
  Information Commissioner under S119A(1) Data Protection Act 2018."

### Resend, Inc.

- DPA: https://resend.com/legal/dpa (updated 31 December 2025). Automatic —
  "shall become legally binding upon Customer entering into the Agreement." No
  plan restriction found.
- UK mechanism: "the EU SCCs, as amended by the UK Addendum."

### Twilio Inc.

- DPA: https://www.twilio.com/en-us/legal/data-protection-addendum (last updated
  9 April 2026). Automatic — "forms part of the agreement(s) between Customer
  and Twilio." No plan restriction found.
- UK mechanism: "the UK International Data Transfer Agreement... Version B1.0,
  in force 21 March 2022."

### Functional Software, Inc. (Sentry)

- DPA: https://sentry.io/legal/dpa/ (version 5.1.0, 29 May 2024). Text: "entered
  into by... the party that electronically accepts or otherwise agrees or
  opts-in to this DPA" — a deliberate step, not silent incorporation, though
  Sentry's own support material describes it as a self-serve in-product action
  rather than a DocuSign exchange.
- UK mechanism: primarily Sentry's self-certification to the "UK Extension to
  the EU-U.S. Data Privacy Framework," falling back to the "International Data
  Transfer Addendum (version B1.0)" if the DPF is ever invalidated.
- Whether that opt-in has actually been clicked for this Sentry account is an
  owner action — not visible from public docs or environment-variable names.

### Upstash, Inc.

- DPA: https://upstash.com/trust/dpa.pdf (last updated April 2025). Automatic —
  incorporated into the Upstash Terms of Service, binding "by accessing or using
  Upstash services in any manner." No plan restriction found.
- UK mechanism: "UK Transfer Addendum template (Addendum B.1.0)."

### Google LLC (Gemini Developer API)

- Terms: Gemini API Additional Terms of Service,
  https://ai.google.dev/gemini-api/terms, which incorporate the "Data Processing
  Addendum for Products Where Google is a Data Processor"
  (https://business.safety.google/processorterms/, Version 10, 7 May 2026) for
  the paid service.
- **Acceptance mechanism**: a developer accepts these terms when creating a
  Gemini API key in Google AI Studio (aistudio.google.com) — sign in, accept the
  terms, then "Create API key." Because the AI-worker's `GEMINI_API_KEY` is
  already live and working in production, that acceptance has necessarily
  already happened; unlike Railway's DocuSign or Sentry's opt-in, this is not a
  separate step that could still be outstanding.
- **Gemini tier finding (the "particular care" item)**: Google's Unpaid Services
  terms (free AI Studio / unpaid Gemini API quota) say Google "uses the content
  you submit... to provide, improve, and develop" its products and that "human
  reviewers may read, annotate, and process" API input and output — and warn "do
  not submit sensitive, confidential, or personal information to the Unpaid
  Services." Paid Services terms say the opposite: "Google doesn't use your
  prompts... or responses to improve our products." **Critically, Google's own
  terms give UK/EEA/Swiss accounts the Paid Services protection regardless of
  which quota is used**: "If you're in the European Economic Area, Switzerland,
  or the United Kingdom, the terms under 'How Google uses Your Data' in 'Paid
  Services' apply to all Services... even though they are offered free of
  charge." Because Leangency is a UK sole trader, this means **whether Aurora's
  Gemini usage is on paid billing or free quota does not change the data-use
  outcome** — both get the no-training, no-product-improvement-use terms —
  **provided the Google account tied to this API key is itself UK-registered**,
  which was not separately verified (no tool here can check a Google account's
  registered country without logging into it) but is consistent with Leangency
  being based in London.
- UK mechanism: Google LLC holds an active "UK Extension to the EU-U.S. Data
  Privacy Framework" certification (original certification 14 September 2023,
  renewal due 13 September 2027).

## OpenRouter suitability (dedicated review)

**Verdict: not suitable for processing Controller personal data as currently
configured.** Two independent reasons, either of which is disqualifying on its
own:

1. **No DPA exists for this account today.** OpenRouter's DPA is Exhibit A to
   its Enterprise Access Agreement
   (https://openrouter.ai/terms-of-service-enterprise), binding only "by
   executing the Order Form" — i.e. an Enterprise contract, not a self-serve
   toggle; that DPA does name "Standard Contractual Clauses" and a "UK Addendum"
   explicitly. OpenRouter's own support guidance confirms self- serve accounts
   "can request access to the Trust Portal to review the DPA for informational
   purposes" only — not binding for them
   (https://openrouter.zendesk.com/hc/en-us/articles/47828437697051). The
   codebase's OpenRouter integration (`OPENROUTER_API_KEY` +
   `OPENROUTER_BASE_URL` on the `ai-worker` Railway service) shows no sign of an
   Enterprise contract or Order Form. Without a UK GDPR Article 28 contract in
   place, OpenRouter cannot lawfully be used as a processor for Controller
   personal data, regardless of any technical setting.
2. **No data-retention/training restriction is configured.** OpenRouter's
   privacy policy (https://openrouter.ai/privacy, updated 6 July 2026) says
   "OpenRouter does not use your Inputs or Outputs for model training," but
   "Some Model Providers may use your Inputs and Outputs for model training or
   improvement" — and OpenRouter exposes per-request controls to prevent that
   (`data_collection: "deny"` to exclude providers that may store data, and
   `zdr: true` to restrict routing to Zero Data Retention endpoints only —
   https://openrouter.ai/docs/features/privacy-and-logging and
   /docs/features/provider-routing). A repo-wide check of `apps/ai-worker/src`
   found **neither parameter set anywhere** — today's requests are not
   restricted to zero-retention providers, so a CRM prompt (lead/contact data
   used for scoring) can currently be routed to a downstream provider that
   stores or trains on it. Compounding this, the codebase's own unconfigured
   default model is `openai/gpt-oss-120b:free` (`llm-factory.ts`,
   `openRouterModelForTier`) — an OpenRouter free-tier model, which typically
   carries a looser data policy than a paid model, on top of the account-level
   gap above.
3. **The downstream-provider chain is pass-through, not flow-down.**
   OpenRouter's privacy policy says it "contractually require[s] Model Providers
   to comply with applicable data protection laws, but the Model Provider's own
   terms govern their independent use of your data to the extent permitted by
   our agreements" — a general legal-compliance floor, not an
   equivalent-obligations flow-down the way this DPA requires of Leangency's own
   sub-processors (see "Sub-processors" in `docs/shared/dpa-content.md`). Each
   underlying model provider's own terms are only linked from its OpenRouter
   provider page, not incorporated here.
4. **Corrected while drafting this register — this is confirmed, not a rumour**:
   Stripe confirmed on 19 August 2026 that it is acquiring OpenRouter
   (TechCrunch,
   https://techcrunch.com/2026/08/19/stripe-didnt-really-buy-openrouter-because-of-the-singularity/,
   "Stripe confirmed on Wednesday that it was buying OpenRouter"), in a deal
   various outlets put at $7-8bn+. OpenRouter's own blog commitment, quoted in
   that piece, says its "product, mission, and current commitments remain
   unchanged," and the deal was expected to close "in a few weeks" from that
   date — so by 2026-10-12 it has likely already closed. This doesn't change
   today's verdict (the DPA-availability and ZDR-configuration problems above
   are unrelated to who owns OpenRouter), but it is a reason to re-check
   OpenRouter's terms again once the acquisition closes and Stripe's own
   policies have had a chance to apply, rather than treat this register as
   settled indefinitely.

**What would make OpenRouter suitable**: an Enterprise agreement with a signed
DPA (Exhibit A), _and_ every AI-worker OpenRouter request setting
`data_collection: "deny"` and `zdr: true` (and, if specific providers are still
a concern, an `ignore` list naming them), _and_ moving the default model off the
`:free` tier. All three are OpenRouter account and code changes outside this
research task's scope — not built here.

**Realistic alternative that already exists in the codebase, not built here**:
`apps/ai-worker/src/lib/llm-factory.ts` already imports `ChatOpenAI`/
`OpenAIEmbeddings` and the `AIProviderSchema` enum already includes `'openai'`
as a selectable provider — switching `AI_PROVIDER` to `openai` and supplying a
real `OPENAI_API_KEY` calls OpenAI's own API directly, no new code. OpenAI
publishes a self-serve DPA (accepted via platform.openai.com → Settings →
Organization → Data Processing Addendum, per third-party compliance summaries of
OpenAI's terms — e.g.
https://www.januscompliance.co.uk/blog/openai-dpa-data-processing-agreement-2026),
does not use API inputs/outputs for training by default, and offers an
approval-gated Zero Data Retention option. OpenAI itself is currently listed as
"integrated but not enabled" in `docs/shared/dpa-content.md` ("Sub-processors")
— this register does not change that; it only confirms the fallback path is real
and already coded if the owner chooses it.

## Owner actions (the only things left that genuinely need him)

Three open items; none is checkable from public vendor docs or an
environment-variable name — each requires looking at an actual vendor account. A
fourth (Vercel) is listed for completeness even though it is already closed — he
answered it on 2026-10-12:

1. **Railway** — has the DPA's DocuSign form been submitted and countersigned by
   Railway for this account? Check: Railway dashboard, or the email thread from
   whoever last engaged Railway's legal/sales contact about a DPA.
2. **Sentry** — has the electronic DPA opt-in been completed for this account?
   Check: Sentry organization settings → Legal & Compliance (or wherever
   Sentry's current self-serve DPA flow lives — see https://sentry.io/legal/dpa/
   for the current instructions link).
3. **OpenRouter** — is this account Enterprise-tier with a signed DPA, or
   self-serve? If self-serve, there is no DPA until that changes — this is a
   commercial decision (cost, terms) for the owner, not a technical one.
4. **Vercel** — the owner already answered this one (2026-10-12): stay on Hobby.
   That means Aurora's Vercel hosting still has no Article 28 contract covering
   it; `docs/shared/dpa-content.md` says so plainly and this is not re-opened
   here as a question.

Google's Gemini API acceptance (see above) and every "automatic" vendor are not
owner actions — they're already satisfied by the account already being live, or
require no action at all.
