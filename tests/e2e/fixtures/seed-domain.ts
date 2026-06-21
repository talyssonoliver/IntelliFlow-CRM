/**
 * Enterprise-persona domain seed for authenticated E2E journeys.
 *
 * Scoped exclusively to the "enterprise" QA persona tenant. Idempotent — every
 * row is upserted by deterministic id (prefixed with a per-tenant marker derived
 * from tenantId), so re-running provisioning never creates duplicates.
 *
 * Seeded entities (all scoped to opts.tenantId):
 *   - 4 Accounts (varied industry)
 *   - 6 Contacts (some linked to accounts)
 *   - 6 Leads (varied status/score/BANT, some linked to accounts)
 *   - 6 Opportunities (each across a different OpportunityStage)
 *   - 7 PipelineStageConfig rows (one per OpportunityStage enum value)
 *   - 6 Tasks (varied status/priority/dueDate, some linked to opportunities)
 *   - 3 Cases (LEGAL module, OPEN/IN_PROGRESS/ON_HOLD)
 *   - 9 CaseTasks (3 per Case — the case-event/timeline model in this schema)
 *   - 4 AutoResponseDrafts (linked to 4 seeded leads, mixed status)
 *
 * NEVER instantiates a PrismaClient or calls $connect/$disconnect.
 * The caller (provision.ts) passes an already-connected client.
 *
 * Runs under `node --import tsx` (tsx/CJS compatible; no Prisma type imports needed).
 */
import { createHash } from 'node:crypto';

export async function seedEnterpriseDomain(
  prisma: any,
  opts: { tenantId: string; ownerId: string; userId: string }
): Promise<{ counts: Record<string, number> }> {
  const { tenantId, ownerId } = opts;

  // Deterministic id marker — unique per tenant, safe across re-runs.
  const M = `qa-${tenantId.slice(0, 8)}`;

  // Domain value objects (e.g. AutoResponseDraftId) reconstitute persisted rows
  // through `isValidUuid`/`isValidEntityId`, which REJECT ids that are neither a
  // UUID nor a cuid — a non-UUID id makes the list/getPendingForApprover queries
  // throw on `toDomain`, so the page hangs on "Loading approvals…". Seed ids must
  // therefore be RFC-4122 UUIDs, yet still deterministic so re-runs upsert rather
  // than duplicate. `uid` derives a stable v4-shaped UUID from `${tenantId}:${key}`;
  // FK refs reuse the same marker string so they hash to the same UUID.
  const uid = (key: string): string => {
    const h = createHash('sha256').update(`${tenantId}:${key}`).digest('hex');
    const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
  };
  // Replace any marker-prefixed identifier (id or FK) with its deterministic UUID;
  // leave plain text (emails embedding the marker, names, bodies) untouched.
  const uuidify = (v: string): string => (v.startsWith(`${M}-`) ? uid(v) : v);
  const remap = <T extends Record<string, unknown>>(obj: T): T => {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(obj)) {
      out[k] = typeof val === 'string' ? uuidify(val) : val;
    }
    return out as T;
  };

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  // Migration cleanup: drop any rows from an earlier seeding that used raw marker
  // ids ("qa-xxxx-acct-1") rather than UUIDs. Those are domain-invalid (break list
  // reconstitution) and their unique emails would collide with the new UUID rows.
  // New rows use UUID ids that never match `startsWith(M-)`, so this is a no-op
  // after the first migrated run. Delete child → parent to respect FKs.
  const markerId = { startsWith: `${M}-` };
  await prisma.autoResponseDraft.deleteMany({ where: { id: markerId } });
  await prisma.caseTask.deleteMany({ where: { id: markerId } });
  await prisma.case.deleteMany({ where: { id: markerId } });
  await prisma.task.deleteMany({ where: { id: markerId } });
  await prisma.opportunity.deleteMany({ where: { id: markerId } });
  await prisma.lead.deleteMany({ where: { id: markerId } });
  await prisma.contact.deleteMany({ where: { id: markerId } });
  await prisma.account.deleteMany({ where: { id: markerId } });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ACCOUNTS
  // Required non-default fields: name, tenantId, ownerId
  // ─────────────────────────────────────────────────────────────────────────────
  const accountDefs = [
    {
      id: `${M}-acct-1`,
      name: 'Acme Technologies',
      industry: 'SaaS',
      employees: 250,
      website: 'https://acme.example.com',
      tenantId,
      ownerId,
    },
    {
      id: `${M}-acct-2`,
      name: 'Blue River Legal',
      industry: 'Legal Services',
      employees: 80,
      website: 'https://blueriver.example.com',
      tenantId,
      ownerId,
    },
    {
      id: `${M}-acct-3`,
      name: 'Northgate Finance',
      industry: 'Financial Services',
      employees: 500,
      website: 'https://northgate.example.com',
      tenantId,
      ownerId,
    },
    {
      id: `${M}-acct-4`,
      name: 'Summit Healthcare',
      industry: 'Healthcare',
      employees: 1200,
      website: 'https://summit.example.com',
      tenantId,
      ownerId,
    },
  ];

  for (const acct of accountDefs) {
    await prisma.account.upsert({
      where: { id: uuidify(acct.id) },
      create: remap(acct),
      update: { name: acct.name, industry: acct.industry, employees: acct.employees },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. CONTACTS
  // Required non-default fields: email, firstName, lastName, tenantId, ownerId
  // Unique constraint: [tenantId, email]
  // ─────────────────────────────────────────────────────────────────────────────
  const contactDefs = [
    {
      id: `${M}-con-1`,
      email: `alice.morgan.${M}@acme.example.com`,
      firstName: 'Alice',
      lastName: 'Morgan',
      title: 'VP of Engineering',
      department: 'Engineering',
      status: 'ACTIVE',
      accountId: `${M}-acct-1`,
      tenantId,
      ownerId,
    },
    {
      id: `${M}-con-2`,
      email: `bob.hayes.${M}@acme.example.com`,
      firstName: 'Bob',
      lastName: 'Hayes',
      title: 'CTO',
      department: 'Executive',
      status: 'ACTIVE',
      accountId: `${M}-acct-1`,
      tenantId,
      ownerId,
    },
    {
      id: `${M}-con-3`,
      email: `carol.lee.${M}@blueriver.example.com`,
      firstName: 'Carol',
      lastName: 'Lee',
      title: 'Managing Partner',
      department: 'Leadership',
      status: 'CUSTOMER',
      accountId: `${M}-acct-2`,
      tenantId,
      ownerId,
    },
    {
      id: `${M}-con-4`,
      email: `david.park.${M}@northgate.example.com`,
      firstName: 'David',
      lastName: 'Park',
      title: 'Director of Finance',
      department: 'Finance',
      status: 'PROSPECT',
      accountId: `${M}-acct-3`,
      tenantId,
      ownerId,
    },
    {
      id: `${M}-con-5`,
      email: `eva.chen.${M}@summit.example.com`,
      firstName: 'Eva',
      lastName: 'Chen',
      title: 'Head of IT',
      department: 'IT',
      status: 'ACTIVE',
      accountId: `${M}-acct-4`,
      tenantId,
      ownerId,
    },
    {
      id: `${M}-con-6`,
      email: `frank.omar.${M}@qa.intelliflow.test`,
      firstName: 'Frank',
      lastName: 'Omar',
      title: 'Procurement Manager',
      department: 'Operations',
      status: 'PROSPECT',
      // No accountId — unlinked contact
      tenantId,
      ownerId,
    },
  ];

  for (const con of contactDefs) {
    await prisma.contact.upsert({
      where: { id: uuidify(con.id) },
      create: remap(con),
      update: { title: con.title, status: con.status },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. LEADS
  // Required non-default fields: email, tenantId, ownerId
  // Unique constraint: [email, tenantId]
  // BANT fields: budget, authority, need, timeline (all optional strings)
  // ─────────────────────────────────────────────────────────────────────────────
  const leadDefs = [
    {
      id: `${M}-lead-1`,
      email: `prospect1.${M}@example.com`,
      firstName: 'Jordan',
      lastName: 'Wu',
      company: 'BrightPath Inc.',
      title: 'CEO',
      source: 'WEBSITE',
      status: 'NEW',
      score: 82,
      budget: '$50,000',
      authority: 'Decision maker',
      need: 'CRM modernization',
      timeline: 'Q3 2026',
      annualRevenue: '$2,000,000',
      estimatedValue: 50000,
      accountId: `${M}-acct-1`,
      tenantId,
      ownerId,
    },
    {
      id: `${M}-lead-2`,
      email: `prospect2.${M}@example.com`,
      firstName: 'Priya',
      lastName: 'Sharma',
      company: 'Vertex Solutions',
      title: 'COO',
      source: 'REFERRAL',
      status: 'CONTACTED',
      score: 68,
      budget: '$30,000',
      authority: 'Influencer',
      need: 'Sales pipeline visibility',
      timeline: 'Q4 2026',
      annualRevenue: '$800,000',
      estimatedValue: 30000,
      tenantId,
      ownerId,
    },
    {
      id: `${M}-lead-3`,
      email: `prospect3.${M}@example.com`,
      firstName: 'Marcus',
      lastName: 'Diaz',
      company: 'IronBridge Corp',
      title: 'VP Sales',
      source: 'EVENT',
      status: 'QUALIFIED',
      score: 91,
      budget: '$120,000',
      authority: 'Decision maker',
      need: 'Full CRM with AI scoring',
      timeline: 'Q2 2026',
      annualRevenue: '$5,000,000',
      estimatedValue: 120000,
      accountId: `${M}-acct-3`,
      tenantId,
      ownerId,
    },
    {
      id: `${M}-lead-4`,
      email: `prospect4.${M}@example.com`,
      firstName: 'Lisa',
      lastName: 'Tanaka',
      company: 'NovaStar Medical',
      title: 'Director of Operations',
      source: 'EMAIL',
      status: 'QUALIFIED',
      score: 75,
      budget: '$80,000',
      authority: 'Decision maker',
      need: 'Appointment and case tracking',
      timeline: 'Q3 2026',
      annualRevenue: '$3,500,000',
      estimatedValue: 80000,
      accountId: `${M}-acct-4`,
      tenantId,
      ownerId,
    },
    {
      id: `${M}-lead-5`,
      email: `prospect5.${M}@example.com`,
      firstName: 'Tom',
      lastName: 'Fitzgerald',
      company: 'Alpine Ventures',
      title: 'CFO',
      source: 'COLD_CALL',
      status: 'NEGOTIATING',
      score: 55,
      budget: '$20,000',
      authority: 'Approver',
      need: 'Basic CRM + reporting',
      timeline: 'Q1 2027',
      annualRevenue: '$600,000',
      estimatedValue: 20000,
      tenantId,
      ownerId,
    },
    {
      id: `${M}-lead-6`,
      email: `prospect6.${M}@example.com`,
      firstName: 'Amara',
      lastName: 'Osei',
      company: 'GreenLink Energy',
      title: 'Head of Strategy',
      source: 'SOCIAL',
      status: 'NEW',
      score: 44,
      budget: '$15,000',
      authority: 'Influencer',
      need: 'Contract management',
      timeline: 'Q4 2026',
      annualRevenue: '$1,200,000',
      estimatedValue: 15000,
      tenantId,
      ownerId,
    },
  ];

  for (const lead of leadDefs) {
    await prisma.lead.upsert({
      where: { id: uuidify(lead.id) },
      create: remap(lead),
      update: { status: lead.status, score: lead.score, budget: lead.budget },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. OPPORTUNITIES
  // Required non-default fields: name, value (Decimal — pass string), tenantId,
  // ownerId, accountId (non-nullable FK)
  // stage defaults PROSPECTING but we set it explicitly per row.
  // ─────────────────────────────────────────────────────────────────────────────
  const opportunityDefs = [
    {
      id: `${M}-opp-1`,
      name: 'Acme Enterprise Platform',
      value: '95000',
      stage: 'PROSPECTING',
      probability: 10,
      accountId: `${M}-acct-1`,
      contactId: `${M}-con-1`,
      tenantId,
      ownerId,
      expectedCloseDate: new Date(now + 90 * DAY),
    },
    {
      id: `${M}-opp-2`,
      name: 'Blue River CRM Rollout',
      value: '42000',
      stage: 'QUALIFICATION',
      probability: 25,
      accountId: `${M}-acct-2`,
      contactId: `${M}-con-3`,
      tenantId,
      ownerId,
      expectedCloseDate: new Date(now + 60 * DAY),
    },
    {
      id: `${M}-opp-3`,
      name: 'Northgate Finance Suite',
      value: '175000',
      stage: 'NEEDS_ANALYSIS',
      probability: 40,
      accountId: `${M}-acct-3`,
      contactId: `${M}-con-4`,
      tenantId,
      ownerId,
      expectedCloseDate: new Date(now + 45 * DAY),
    },
    {
      id: `${M}-opp-4`,
      name: 'Summit Healthcare AI Upgrade',
      value: '210000',
      stage: 'PROPOSAL',
      probability: 60,
      accountId: `${M}-acct-4`,
      contactId: `${M}-con-5`,
      tenantId,
      ownerId,
      expectedCloseDate: new Date(now + 30 * DAY),
    },
    {
      id: `${M}-opp-5`,
      name: 'Acme Renewal — Pro Tier',
      value: '58000',
      stage: 'NEGOTIATION',
      probability: 80,
      accountId: `${M}-acct-1`,
      tenantId,
      ownerId,
      expectedCloseDate: new Date(now + 14 * DAY),
    },
    {
      id: `${M}-opp-6`,
      name: 'Northgate Expansion Deal',
      value: '320000',
      stage: 'CLOSED_WON',
      probability: 100,
      accountId: `${M}-acct-3`,
      tenantId,
      ownerId,
      expectedCloseDate: new Date(now - 7 * DAY),
      closedAt: new Date(now - 7 * DAY),
    },
  ];

  for (const opp of opportunityDefs) {
    await prisma.opportunity.upsert({
      where: { id: uuidify(opp.id) },
      create: remap(opp),
      update: { stage: opp.stage, value: opp.value, probability: opp.probability },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. PIPELINE STAGE CONFIGS
  // Required non-default fields: stageKey, displayName, order, tenantId
  // Unique constraint: [tenantId, stageKey]
  // probability is Float (0–100 expressed as 0.0–100.0 — schema stores Float not Int)
  // ─────────────────────────────────────────────────────────────────────────────
  const stageDefs = [
    {
      stageKey: 'PROSPECTING',
      displayName: 'Prospecting',
      color: '#6366f1',
      order: 1,
      probability: 10,
      isActive: true,
    },
    {
      stageKey: 'QUALIFICATION',
      displayName: 'Qualification',
      color: '#8b5cf6',
      order: 2,
      probability: 25,
      isActive: true,
    },
    {
      stageKey: 'NEEDS_ANALYSIS',
      displayName: 'Needs Analysis',
      color: '#3b82f6',
      order: 3,
      probability: 40,
      isActive: true,
    },
    {
      stageKey: 'PROPOSAL',
      displayName: 'Proposal',
      color: '#f59e0b',
      order: 4,
      probability: 60,
      isActive: true,
    },
    {
      stageKey: 'NEGOTIATION',
      displayName: 'Negotiation',
      color: '#f97316',
      order: 5,
      probability: 80,
      isActive: true,
    },
    {
      stageKey: 'CLOSED_WON',
      displayName: 'Closed Won',
      color: '#22c55e',
      order: 6,
      probability: 100,
      isActive: true,
    },
    {
      stageKey: 'CLOSED_LOST',
      displayName: 'Closed Lost',
      color: '#ef4444',
      order: 7,
      probability: 0,
      isActive: true,
    },
  ];

  for (const stage of stageDefs) {
    await prisma.pipelineStageConfig.upsert({
      where: { tenantId_stageKey: { tenantId, stageKey: stage.stageKey } },
      create: { ...stage, tenantId },
      update: {
        displayName: stage.displayName,
        color: stage.color,
        order: stage.order,
        probability: stage.probability,
        isActive: stage.isActive,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. TASKS
  // Required non-default fields: title, tenantId, ownerId
  // priority defaults MEDIUM, status defaults PENDING — set explicitly for variety
  // ─────────────────────────────────────────────────────────────────────────────
  const taskDefs = [
    {
      id: `${M}-task-1`,
      title: 'Follow up with Acme on enterprise proposal',
      description: 'Send revised pricing deck and schedule technical deep-dive',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      dueDate: new Date(now + 2 * DAY),
      opportunityId: `${M}-opp-1`,
      tenantId,
      ownerId,
    },
    {
      id: `${M}-task-2`,
      title: 'Prepare Blue River demo environment',
      description: 'Configure demo tenant with legal module enabled',
      priority: 'HIGH',
      status: 'PENDING',
      dueDate: new Date(now + 3 * DAY),
      opportunityId: `${M}-opp-2`,
      tenantId,
      ownerId,
    },
    {
      id: `${M}-task-3`,
      title: 'Review Northgate security questionnaire',
      description: 'Complete security and compliance section B',
      priority: 'URGENT',
      status: 'PENDING',
      dueDate: new Date(now + DAY),
      opportunityId: `${M}-opp-3`,
      tenantId,
      ownerId,
    },
    {
      id: `${M}-task-4`,
      title: 'Schedule Summit Healthcare executive briefing',
      description: 'Book 90-min session with CMO and IT head',
      priority: 'MEDIUM',
      status: 'PENDING',
      dueDate: new Date(now + 7 * DAY),
      tenantId,
      ownerId,
    },
    {
      id: `${M}-task-5`,
      title: 'Close Acme renewal contract',
      description: 'Obtain final signatures on renewal addendum',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      dueDate: new Date(now + 5 * DAY),
      opportunityId: `${M}-opp-5`,
      tenantId,
      ownerId,
    },
    {
      id: `${M}-task-6`,
      title: 'Update Q2 pipeline forecast',
      description: 'Reconcile stage probabilities and submit to leadership',
      priority: 'LOW',
      status: 'COMPLETED',
      completedAt: new Date(now - 2 * DAY),
      dueDate: new Date(now - 2 * DAY),
      tenantId,
      ownerId,
    },
  ];

  for (const task of taskDefs) {
    await prisma.task.upsert({
      where: { id: uuidify(task.id) },
      create: remap(task),
      update: { status: task.status, priority: task.priority, dueDate: task.dueDate },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. CASES (LEGAL module)
  // Required non-default fields: title, clientId (Account FK), assignedTo (User FK),
  // tenantId
  // status defaults OPEN, priority defaults MEDIUM — vary explicitly
  // Note: the case-event/timeline model in this schema is CaseTask (case_tasks),
  // NOT a separate CaseTimelineEvent model. CaseTask.assignee is a User FK (String?).
  // ─────────────────────────────────────────────────────────────────────────────
  const caseDefs = [
    {
      id: `${M}-case-1`,
      title: 'Breach of Contract — Acme Technologies',
      description:
        'Client alleges failure to deliver contracted software modules by the agreed deadline.',
      status: 'OPEN',
      priority: 'HIGH',
      clientId: `${M}-acct-1`,
      assignedTo: ownerId,
      jurisdiction: 'US-CA',
      timezone: 'America/Los_Angeles',
      deadline: new Date(now + 30 * DAY),
      tenantId,
    },
    {
      id: `${M}-case-2`,
      title: 'Employment Dispute — Northgate Finance',
      description: 'Wrongful termination claim filed by former senior analyst.',
      status: 'IN_PROGRESS',
      priority: 'URGENT',
      clientId: `${M}-acct-3`,
      assignedTo: ownerId,
      jurisdiction: 'US-NY',
      timezone: 'America/New_York',
      deadline: new Date(now + 14 * DAY),
      tenantId,
    },
    {
      id: `${M}-case-3`,
      title: 'IP Licensing Review — Summit Healthcare',
      description: 'Review and negotiate terms for third-party diagnostic algorithm licensing.',
      status: 'ON_HOLD',
      priority: 'MEDIUM',
      clientId: `${M}-acct-4`,
      assignedTo: ownerId,
      jurisdiction: 'US-MA',
      timezone: 'America/New_York',
      deadline: new Date(now + 60 * DAY),
      tenantId,
    },
  ];

  for (const c of caseDefs) {
    await prisma.case.upsert({
      where: { id: uuidify(c.id) },
      create: remap(c),
      update: { status: c.status, priority: c.priority, description: c.description },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. CASE TASKS (the case-event/activity model in this schema)
  // Required non-default fields: caseId, title, tenantId
  // status defaults PENDING; assignee is a nullable User FK (String?)
  // 3 CaseTasks per Case = 9 total
  // ─────────────────────────────────────────────────────────────────────────────
  const caseTaskDefs = [
    // Case 1 tasks
    {
      id: `${M}-ct-1-1`,
      caseId: `${M}-case-1`,
      title: 'Review breach notice documentation',
      description: 'Compile all written communications and delivery records',
      status: 'COMPLETED',
      assignee: ownerId,
      dueDate: new Date(now - 3 * DAY),
      completedAt: new Date(now - 2 * DAY),
      tenantId,
    },
    {
      id: `${M}-ct-1-2`,
      caseId: `${M}-case-1`,
      title: 'Draft initial response to plaintiff',
      description: 'Prepare formal response disputing the breach claims',
      status: 'IN_PROGRESS',
      assignee: ownerId,
      dueDate: new Date(now + 5 * DAY),
      tenantId,
    },
    {
      id: `${M}-ct-1-3`,
      caseId: `${M}-case-1`,
      title: 'Schedule mediation session',
      description: 'Coordinate with opposing counsel on available dates',
      status: 'PENDING',
      assignee: ownerId,
      dueDate: new Date(now + 20 * DAY),
      tenantId,
    },
    // Case 2 tasks
    {
      id: `${M}-ct-2-1`,
      caseId: `${M}-case-2`,
      title: 'Obtain personnel records',
      description: 'Request HR file, performance reviews, and termination docs',
      status: 'COMPLETED',
      assignee: ownerId,
      dueDate: new Date(now - 5 * DAY),
      completedAt: new Date(now - 4 * DAY),
      tenantId,
    },
    {
      id: `${M}-ct-2-2`,
      caseId: `${M}-case-2`,
      title: 'Interview key witnesses',
      description: 'Schedule depositions with HR director and direct manager',
      status: 'IN_PROGRESS',
      assignee: ownerId,
      dueDate: new Date(now + 7 * DAY),
      tenantId,
    },
    {
      id: `${M}-ct-2-3`,
      caseId: `${M}-case-2`,
      title: 'File court response',
      description: 'Submit formal defense brief to court',
      status: 'PENDING',
      assignee: ownerId,
      dueDate: new Date(now + 14 * DAY),
      tenantId,
    },
    // Case 3 tasks
    {
      id: `${M}-ct-3-1`,
      caseId: `${M}-case-3`,
      title: 'Review existing IP licensing agreements',
      description: 'Identify conflicting terms in current vendor contracts',
      status: 'COMPLETED',
      assignee: ownerId,
      dueDate: new Date(now - 10 * DAY),
      completedAt: new Date(now - 8 * DAY),
      tenantId,
    },
    {
      id: `${M}-ct-3-2`,
      caseId: `${M}-case-3`,
      title: 'Draft licensing term sheet',
      description: 'Prepare key terms for negotiation with algorithm provider',
      status: 'PENDING',
      assignee: ownerId,
      dueDate: new Date(now + 45 * DAY),
      tenantId,
    },
    {
      id: `${M}-ct-3-3`,
      caseId: `${M}-case-3`,
      title: 'Legal opinion on IP ownership scope',
      description: 'Engage external IP counsel for written opinion',
      status: 'PENDING',
      dueDate: new Date(now + 55 * DAY),
      tenantId,
    },
  ];

  for (const ct of caseTaskDefs) {
    await prisma.caseTask.upsert({
      where: { id: uuidify(ct.id) },
      create: remap(ct),
      update: { status: ct.status, title: ct.title },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. AUTO-RESPONSE DRAFTS
  // Required non-default fields: tenantId, leadId (Lead FK), recipientEmail,
  // subject, body, aiConfidence (Float), modelVersion (String),
  // triggerType (AutoResponseTrigger), expiresAt (DateTime)
  // status defaults DRAFT; statusHistory defaults "[]"
  // Linked to leads 1–4 (all have qualifying statuses).
  // ─────────────────────────────────────────────────────────────────────────────
  const draftDefs = [
    {
      id: `${M}-ard-1`,
      tenantId,
      leadId: `${M}-lead-1`,
      recipientEmail: `prospect1.${M}@example.com`,
      subject: 'Following up on your CRM modernization inquiry',
      body: 'Hi Jordan,\n\nThank you for reaching out about your CRM modernization needs at BrightPath Inc. I wanted to follow up and share how IntelliFlow can address your Q3 2026 timeline.\n\nWould you be available for a 30-minute call this week?\n\nBest regards,\nIntelliFlow Team',
      aiConfidence: 0.91,
      modelVersion: 'gpt-4o-2024-08-06',
      triggerType: 'EMAIL_RECEIVED',
      status: 'PENDING_APPROVAL',
      expiresAt: new Date(now + 48 * 60 * 60 * 1000),
    },
    {
      id: `${M}-ard-2`,
      tenantId,
      leadId: `${M}-lead-2`,
      recipientEmail: `prospect2.${M}@example.com`,
      subject: 'IntelliFlow for pipeline visibility — quick overview',
      body: 'Hi Priya,\n\nThank you for connecting with us. Based on your interest in sales pipeline visibility for Vertex Solutions, I wanted to share a brief overview of how IntelliFlow CRM can help.\n\nOur pipeline dashboard provides real-time stage tracking, automated follow-up reminders, and AI-powered deal scoring.\n\nLet me know if you would like to see a personalised demo.\n\nBest regards,\nIntelliFlow Team',
      aiConfidence: 0.78,
      modelVersion: 'gpt-4o-2024-08-06',
      triggerType: 'FORM_SUBMIT',
      status: 'DRAFT',
      expiresAt: new Date(now + 48 * 60 * 60 * 1000),
    },
    {
      id: `${M}-ard-3`,
      tenantId,
      leadId: `${M}-lead-3`,
      recipientEmail: `prospect3.${M}@example.com`,
      subject: 'Your IntelliFlow AI-scoring trial is ready',
      body: 'Hi Marcus,\n\nGreat speaking with you at the event. As promised, I have set up a trial workspace for IronBridge Corp with our AI lead-scoring features enabled.\n\nYour access link is active for 14 days. Our onboarding team will reach out to schedule your kickoff call.\n\nBest regards,\nIntelliFlow Team',
      aiConfidence: 0.95,
      modelVersion: 'gpt-4o-2024-08-06',
      triggerType: 'EMAIL_RECEIVED',
      status: 'APPROVED',
      expiresAt: new Date(now + 48 * 60 * 60 * 1000),
    },
    {
      id: `${M}-ard-4`,
      tenantId,
      leadId: `${M}-lead-4`,
      recipientEmail: `prospect4.${M}@example.com`,
      subject: 'Re: appointment & case tracking — escalating to specialist',
      body: 'Hi Lisa,\n\nThank you for your detailed requirements around appointment and case tracking for NovaStar Medical. Given the complexity of your workflow, I am escalating this to our Healthcare Solutions specialist who can provide a tailored walkthrough.\n\nExpect a call within 24 hours.\n\nBest regards,\nIntelliFlow Team',
      aiConfidence: 0.72,
      modelVersion: 'gpt-4o-2024-08-06',
      triggerType: 'EMAIL_RECEIVED',
      status: 'ESCALATED',
      escalationCount: 1,
      expiresAt: new Date(now + 48 * 60 * 60 * 1000),
    },
  ];

  for (const draft of draftDefs) {
    await prisma.autoResponseDraft.upsert({
      where: { id: uuidify(draft.id) },
      create: remap(draft),
      update: { status: draft.status, subject: draft.subject, body: draft.body },
    });
  }

  const counts = {
    accounts: accountDefs.length,
    contacts: contactDefs.length,
    leads: leadDefs.length,
    opportunities: opportunityDefs.length,
    pipelineStageConfigs: stageDefs.length,
    tasks: taskDefs.length,
    cases: caseDefs.length,
    caseTasks: caseTaskDefs.length,
    autoResponseDrafts: draftDefs.length,
  };

  console.log('[seed-domain] enterprise domain seeded:', counts);
  return { counts };
}
