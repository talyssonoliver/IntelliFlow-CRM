---
title: Data Processing Addendum
version: v2026.10
effectiveDate: 2026-10-07
contactEmail: legal@leangency.com
summary:
  - Leangency acts as a data processor under UK GDPR Article 28 on behalf of the
    customer as controller.
  - Processing occurs only on documented instructions from the controller and
    for the duration of the service agreement.
  - Sub-processors are listed in this DPA and are subject to equivalent
    contractual obligations to those set out here.
  - Data subjects may exercise rights through the controller, with Leangency
    providing reasonable technical assistance.
  - Data is returned or deleted upon agreement termination, except where
    retention is required by law.
  - Security measures are risk-based and proportionate, and are reviewed as the
    service and its sub-processors change.
---

## Introduction and Parties

[DRAFT — pending owner review and approval. This text has not been reviewed by a
qualified lawyer and does not take legal effect until Talysson da Silva Oliveira
approves it and the entity details below are confirmed. Nothing in this draft
should be relied upon, signed, or sent to a customer as a final DPA.]

This Data Processing Addendum ("DPA") forms part of the Aurora Terms of Service
and governs the processing of personal data by the operator of Aurora on behalf
of the customer ("Controller"). Aurora is operated by Talysson da Silva
Oliveira, a sole trader trading as "Leangency" ("Processor", "Leangency", "we",
"us") [OWNER TO CONFIRM: registered business address, VAT status/number if
applicable, and whether any other trading or company registration exists, before
this DPA is finalised or sent to a customer for signature].

This DPA is entered into pursuant to Article 28 of the UK General Data
Protection Regulation (the retained version of Regulation (EU) 2016/679 as it
forms part of the law of the United Kingdom by virtue of section 3 of the
European Union (Withdrawal) Act 2018, as amended by the Data Protection, Privacy
and Electronic Communications (Amendments etc) (EU Exit) Regulations 2019 and
later by the Data (Use and Access) Act 2025 — "UK GDPR"), together with the Data
Protection Act 2018. Where the Controller or its data subjects are also subject
to the EU GDPR (Regulation (EU) 2016/679), the parties intend for the equivalent
EU GDPR Article 28 obligations to apply in parallel. The Information
Commissioner's Office ("ICO") is the UK supervisory authority; its guidance on
this Article 28 contract is at
https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/contracts-and-liabilities-between-controllers-and-processors-multi/what-needs-to-be-included-in-the-contract/.

## Subject Matter and Duration of Processing

The subject matter of the processing is the provision of the Aurora CRM platform
(lead, contact, account, opportunity, case, and ticket management, AI-assisted
scoring and workflow automation, and related communications) as described in the
Terms of Service. The duration of processing is coterminous with the
Controller's subscription to Aurora, starting when the Controller's tenant is
provisioned and continuing until the subscription ends.

Upon expiry or termination of the Terms of Service, personal data is handled as
set out in "Data Return and Deletion" below.

## Nature and Purpose of Processing

The Processor processes personal data solely to provide Aurora's contracted
functionality: capturing and qualifying leads, managing contacts, accounts,
opportunities, cases and tickets, scheduling appointments, sending transactional
email and SMS notifications, generating AI-assisted lead scores and predictions,
maintaining an audit trail of account activity, and billing the Controller's
subscription.

Processing activities include collection, storage, retrieval, consultation, use,
AI-assisted analysis, disclosure to the sub-processors listed below, and erasure
or destruction of personal data, each only as necessary to deliver the
contracted service or to comply with a legal obligation.

## Types of Personal Data

The personal data processed under this DPA includes, but is not limited to:
contact details (names, email addresses, phone numbers), account and company
information, CRM interaction history (notes, activities, emails, calls,
appointments, support tickets), AI-generated scores and predictions derived from
that interaction history, and technical data such as user-agent and IP address
captured for security and fraud-prevention logging.

Special categories of personal data as defined by UK GDPR Article 9 (health,
biometric, racial or ethnic origin, and similar data) are not intended to be
processed by Aurora. The Controller is responsible for ensuring no such data is
submitted to the platform; the Processor has no mechanism to detect or filter
special category data submitted in free-text fields.

## Categories of Data Subjects

The categories of data subjects whose personal data is processed include: the
Controller's leads and prospective customers, the Controller's existing
customers and contacts, the Controller's own employees and contractors who are
given user accounts on the platform, and third-party business contacts (for
example, opposing parties, vendors, or partners) that the Controller's users
record in the CRM.

## Obligations and Rights of the Controller

The Controller shall ensure that personal data submitted to Aurora has a lawful
basis for processing under applicable data protection law, that any required
privacy notices have been given to the relevant data subjects, and that it has
authority to instruct the Processor on the processing of that data. The
Controller is responsible for responding to data subject rights requests it
receives directly and for notifying the Processor of any instruction that would
change how personal data is processed.

The Controller retains all rights to the personal data processed on its behalf
and may instruct the Processor to correct, delete, or export that data at any
time through the product or by emailing legal@leangency.com.

## Sub-processors

The Controller grants Leangency general authorisation to engage the
sub-processors listed below, each of which is given access only to the personal
data necessary to perform its function and is bound by a data-processing
agreement or equivalent standard contractual terms. Leangency will notify the
Controller of any intended addition or replacement of a sub-processor by email
to the Controller's registered account contact, giving the Controller a
reasonable opportunity to object on reasonable data-protection grounds before
the change takes effect.

As of this draft, the sub-processors actually integrated in Aurora's codebase
and infrastructure configuration are: Vercel Inc. (hosts the Aurora web
application); Railway Corporation (hosts the API, AI-worker, and background-job
services); Supabase, Inc. (managed PostgreSQL database, authentication, and file
storage); Upstash, Inc. (managed Redis, used for caching, rate limiting, and job
queues); OpenAI, L.L.C. and Anthropic, PBC (large-language-model providers used
for AI-assisted lead scoring, predictions, and workflow automation); Twilio Inc.
(SMS delivery for notifications); Resend, Inc. and/or Twilio SendGrid Inc.
(transactional email delivery — the active provider is an environment-level
configuration choice); Functional Software, Inc., trading as Sentry (error
tracking and performance monitoring); and, where a deployment configures
file/document storage against Amazon S3, Amazon Web Services, Inc.

[OWNER TO CONFIRM: which of the above are actually enabled in the live
production environment (several are configured per-deployment via environment
variables that are not committed to source control, for example the choice
between Resend and SendGrid, and whether AWS S3 storage is active), and whether
a signed data-processing agreement or standard contractual terms are on file
with each one actually in use.]

## Data Subject Rights Assistance

The Processor shall provide reasonable technical assistance to the Controller in
responding to requests from data subjects exercising their rights under UK GDPR,
including the rights of access, rectification, erasure, restriction,
portability, and objection, and will not respond directly to a data subject
request unless instructed to do so by the Controller or required to do so by
law.

## Security Measures

The Processor implements technical and organisational measures appropriate to
the risk, in line with UK GDPR Article 32 and the ICO's guidance on security
(https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/).
These measures include encryption in transit (TLS) and at rest for the primary
database, role-based access control and tenant isolation enforced through
row-level security, authenticated and audited administrative access, and logging
of security-relevant events.

Aurora does not currently hold an independent security certification such as SOC
2 or ISO/IEC 27001; references to such standards elsewhere in Aurora's
documentation describe internal controls modelled on those frameworks, not an
externally certified status. Detailed technical and organisational measures are
available to a Controller on request to legal@leangency.com, and the Processor
will assist the Controller with its own Article 32 obligations, breach
notifications under Article 33/34, and any data protection impact assessment
that depends on how the Processor handles the Controller's data.

## Data Return and Deletion

Upon termination of the Terms of Service, or on the Controller's written
request, the Processor shall delete or return all personal data processed on the
Controller's behalf, and delete existing copies, within 30 days, unless
retention of specific data is required by UK law (for example, billing records
kept for tax purposes). The Controller may choose return, deletion, or export
through the product's export tooling or by emailing legal@leangency.com.

## Audit and Compliance

The Processor shall make available to the Controller the information reasonably
necessary to demonstrate compliance with this DPA, and shall allow for and
contribute to audits, including inspections, conducted by the Controller or an
auditor mandated by the Controller, subject to reasonable advance notice, a
reasonable frequency, and the Processor's and its sub-processors'
confidentiality obligations to other customers.

## International Transfers

Several of the sub-processors listed above are based outside the United Kingdom,
principally in the United States, so using them involves a restricted transfer
of personal data under UK GDPR Chapter V. Any such transfer relies on one of the
safeguards recognised by the ICO: a UK adequacy regulation for the destination,
the International Data Transfer Agreement ("IDTA") or the International Data
Transfer Addendum to the EU Standard Contractual Clauses, or UK Binding
Corporate Rules, together with a transfer risk assessment confirming that the
data is not materially less protected after the transfer. The ICO's current
(2026) guidance, including its three-step test for identifying a restricted
transfer, is at
https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/a-brief-guide-to-international-transfers/
and
https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2026/01/updated-guidance-on-international-transfers-published/.

[OWNER TO CONFIRM: Leangency relies on each sub-processor's own standard
safeguard (for example, the sub-processor's published UK Addendum or Standard
Contractual Clauses) rather than a safeguard executed directly between Leangency
and that sub-processor. This has not been independently verified against each
sub-processor's current terms and should be confirmed, and recorded here, before
this DPA is relied upon.]

## Draft Status and Owner Approval

This Data Processing Addendum was drafted to replace placeholder text (tracked
as S17-AUDIT-006 in issue #260) and has not undergone legal review. It is a
starting point for Talysson da Silva Oliveira to review, amend, and approve —
not a finished, legally-reviewed document. The entity details, sub-processor
list, and international-transfer safeguards above are marked [OWNER TO CONFIRM]
and must be confirmed or corrected before this DPA is presented to, or signed
with, any customer.
