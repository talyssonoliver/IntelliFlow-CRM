/**
 * PG-203 — data subject request workflow (spec Addendum A, rounds 2-4, sign-off 1-8;
 * owner rulings Q13/Q14/Q16-Q19).
 *
 * The firm (tenant) is the controller. A public request is verified by a single-use link
 * sent to the address; a staff-logged request starts verified on the admin's identity check.
 * ACCESS/PORTABILITY exports go out automatically; erasure, rectification, restriction and
 * objection wait for an admin. Every answer to the public is generic: nothing reveals whether
 * an email matches CRM data. Storage atomicity (caps under locks, single-use tokens, the
 * erasure transaction) lives behind the ports.
 */
import {
  DSAR_LIMITS,
  accessCompletesAtVerify,
  accessResolutionNote,
  addCalendarMonths,
  canExtend,
  extendedDeadline,
  rejectionIsLate,
  staffErasureMayRun,
  type DsarObjectionScope,
  type DsarRequestType,
  type DsarWithheldCategory,
} from '@intelliflow/domain';
import type {
  DsarFirm,
  DsarRecord,
  DsarRepositoryPort,
} from '../ports/repositories/DsarRepositoryPort';
import type { ErasureOutcome, SubjectDataPort } from '../ports/repositories/SubjectDataPort';
import type {
  ActiveRestriction,
  ProcessingRestrictionPort,
  RestrictionStatus,
} from '../ports/repositories/ProcessingRestrictionPort';
import type {
  DsarNotice,
  DsarNotificationPort,
  DsarTokenPort,
} from '../ports/external/DsarNotificationPort';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** The only thing a public submitter is ever told. */
export const DSAR_SUBMIT_MESSAGE =
  'Thank you. If this address can receive email, a confirmation link is on its way. Your request starts when you confirm it.';

const EXPORT_TYPES: ReadonlySet<DsarRequestType> = new Set(['ACCESS', 'PORTABILITY']);

const WITHHELD_NOTE =
  'Not included in this file while the firm reviews it. You will receive it, or a notice of what is withheld and why, by the due date.';
/** After the firm completed the request: its decision and reasons went to the person by email. */
const WITHHELD_FINAL_NOTE =
  'Withheld by the firm. Its reasons were sent to you by email when your request was completed.';

export interface DsarServiceDeps {
  repo: DsarRepositoryPort;
  subjectData: SubjectDataPort;
  restrictions: ProcessingRestrictionPort;
  notifications: DsarNotificationPort;
  tokens: DsarTokenPort;
  /**
   * Public origin of the web app, for links (`${appUrl}/dsar/<handle>/...#r=<id>.<token>`).
   * Read when a link is built, so a missing production setting fails that request, not startup.
   */
  appUrl: () => string;
}

export interface DsarExport {
  generatedAt: string;
  processingInformation: {
    controller: { name: string; privacyUrl: string | null };
    purposes: string[];
    categories: string[];
    recipients: string[];
    retention: string;
    source: string;
    rights: string[];
    complaint: string;
    automatedDecisions: string;
  };
  data: Record<string, Array<Record<string, unknown>>>;
  withheld: Array<{ category: DsarWithheldCategory; count: number; note: string }>;
}

type NotFound = { outcome: 'NOT_FOUND' };
type Conflict = { outcome: 'CONFLICT' };
type Invalid = { outcome: 'INVALID'; field?: string };
type Refused = { outcome: 'REFUSED'; reason: string };
type Ok<T = object> = { outcome: 'OK' } & T;

export class DataSubjectRequestService {
  constructor(private readonly deps: DsarServiceDeps) {}

  // ─── Public ─────────────────────────────────────────────────────────────────

  async submit(input: {
    firm: { tenantId: string; name: string; handle: string };
    type: DsarRequestType;
    email: string;
    details: string | null;
    objectionScope: DsarObjectionScope | null;
    ipHash: string | null;
    now: Date;
  }): Promise<{ outcome: 'ACCEPTED'; message: string } | { outcome: 'TOO_MANY' }> {
    const { token, hash } = this.deps.tokens.issue();
    const reserved = await this.deps.repo.reserveSubmission(
      {
        tenantId: input.firm.tenantId,
        type: input.type,
        subjectEmail: input.email,
        capEmailHash: this.deps.tokens.capEmailHash(input.email),
        details: input.details,
        objectionScope: input.objectionScope,
        ipHash: input.ipHash,
        verificationTokenHash: hash,
        verificationExpiresAt: new Date(
          input.now.getTime() + DSAR_LIMITS.verificationHours * MS_PER_HOUR
        ),
      },
      {
        perTenantEmailPerDay: DSAR_LIMITS.capPerTenantEmailPerDay,
        perIpPerHour: DSAR_LIMITS.capPerIpPerHour,
        globalEmailPerDay: DSAR_LIMITS.capGlobalEmailPerDay,
        perTenantPerDay: DSAR_LIMITS.capPerTenantPerDay,
        resendCooldownMinutes: DSAR_LIMITS.resendCooldownMinutes,
      },
      input.now
    );
    if (reserved.outcome === 'CAPPED') return { outcome: 'TOO_MANY' };
    if (reserved.outcome === 'CREATED') {
      // Detached on purpose: the reply takes the same time whether or not an email goes out.
      this.dispatch({
        kind: 'VERIFY_LINK',
        to: input.email,
        firmName: input.firm.name,
        type: input.type,
        link: this.link(input.firm.handle, 'verify', reserved.record.id, token),
        expiresAt: new Date(input.now.getTime() + DSAR_LIMITS.verificationHours * MS_PER_HOUR),
      });
    }
    return { outcome: 'ACCEPTED', message: DSAR_SUBMIT_MESSAGE };
  }

  async verify(input: {
    requestId: string;
    token: string;
    now: Date;
  }): Promise<
    | { outcome: 'VERIFIED'; type: DsarRequestType; dueDate: Date; exportEmailed: boolean }
    | { outcome: 'INVALID' }
  > {
    const record = await this.deps.repo.findById(input.requestId);
    // Always compare (a dummy hash when the id is unknown), so timing does not tell.
    const tokenOk = this.deps.tokens.matches(input.token, record?.verificationTokenHash ?? null);
    if (
      !record ||
      !tokenOk ||
      record.status !== 'PENDING_VERIFICATION' ||
      !record.verificationExpiresAt ||
      record.verificationExpiresAt <= input.now
    ) {
      return { outcome: 'INVALID' };
    }
    const dueDate = addCalendarMonths(input.now, 1);
    // One transaction: the token is spent and, for a RESTRICTION, the restriction starts.
    // If either write fails neither lands (the link still works); a race loser writes nothing.
    const verified = await this.deps.repo.transition(
      record.tenantId,
      record.id,
      'PENDING_VERIFICATION',
      {
        status: 'VERIFIED',
        verificationTokenHash: null,
        verificationExpiresAt: null,
        verifiedAt: input.now,
        slaDeadline: dueDate,
      },
      record.type === 'RESTRICTION'
        ? {
            restrict: {
              subjectEmail: record.subjectEmail,
              blocksMarketing: false,
              createdById: null,
            },
          }
        : undefined
    );
    if (!verified) return { outcome: 'INVALID' };

    // Everything below runs after the verification committed: a failed read or send must not
    // throw, because the link is now used and the person cannot verify again (codex).
    const firm = await this.deps.repo.findFirm(record.tenantId).catch(() => null);
    const firmName = firm?.name ?? 'the firm';
    this.dispatch({
      kind: 'VERIFIED',
      to: record.subjectEmail,
      firmName,
      type: record.type,
      dueDate,
    });
    this.dispatch({
      kind: 'ADMIN_NEW_REQUEST',
      tenantId: record.tenantId,
      requestId: record.id,
      type: record.type,
      dueDate,
    });

    let exportEmailed = false;
    if (EXPORT_TYPES.has(record.type) && firm?.handle) {
      // Not issued: the admin sees an open access request and sends it with exportData.
      exportEmailed = await this.issueExport(verified, firm, input.now).catch(() => false);
    }
    return { outcome: 'VERIFIED', type: record.type, dueDate, exportEmailed };
  }

  async downloadExport(input: {
    requestId: string;
    token: string;
    now: Date;
  }): Promise<
    { outcome: 'OK'; export: DsarExport } | { outcome: 'INVALID' } | { outcome: 'LIMIT' }
  > {
    const record = await this.deps.repo.findById(input.requestId);
    const tokenOk = this.deps.tokens.matches(input.token, record?.exportTokenHash ?? null);
    if (
      !record ||
      !tokenOk ||
      record.status === 'REJECTED' ||
      !EXPORT_TYPES.has(record.type) ||
      !record.exportExpiresAt ||
      record.exportExpiresAt <= input.now
    ) {
      return { outcome: 'INVALID' };
    }
    const counted = await this.deps.repo.recordDownload({
      id: record.id,
      tokenHash: record.exportTokenHash!,
      maxDownloads: DSAR_LIMITS.maxExportDownloads,
      now: input.now,
    });
    if (!counted) {
      // Still the same live link: the cap was reached. Otherwise it was revoked or
      // expired after the check above, and the download is refused (codex).
      return (await this.stillAuthorised(record.id, input.token, input.now))
        ? { outcome: 'LIMIT' }
        : { outcome: 'INVALID' };
    }
    return { outcome: 'OK', export: await this.buildExport(record, input.now) };
  }

  /** The link still matches and has not expired (re-read after a refused count). */
  private async stillAuthorised(id: string, token: string, now: Date): Promise<boolean> {
    const fresh = await this.deps.repo.findById(id);
    return Boolean(
      fresh?.exportExpiresAt &&
      fresh.status !== 'REJECTED' &&
      fresh.exportExpiresAt > now &&
      this.deps.tokens.matches(token, fresh.exportTokenHash)
    );
  }

  // ─── Admin (callers enforce ADMIN of `tenantId`) ───────────────────────────────

  list(tenantId: string, status?: DsarRecord['status']): Promise<DsarRecord[]> {
    return this.deps.repo.list(tenantId, status);
  }

  listRestrictions(tenantId: string): Promise<ActiveRestriction[]> {
    return this.deps.restrictions.listActive(tenantId);
  }

  restrictionStatus(tenantId: string, subjectEmail: string): Promise<RestrictionStatus> {
    return this.deps.restrictions.status(tenantId, subjectEmail);
  }

  async logRequest(input: {
    tenantId: string;
    actorId: string;
    firm: { name: string };
    type: DsarRequestType;
    email: string;
    details: string | null;
    objectionScope: DsarObjectionScope | null;
    receivedOn: string;
    receivedOnReason: string | null;
    identityMethod: DsarRecord['identityMethod'] & string;
    identityNote: string;
    now: Date;
  }): Promise<Ok<{ record: DsarRecord }> | Invalid> {
    const today = input.now.toISOString().slice(0, 10);
    const earliest = new Date(input.now.getTime() - DSAR_LIMITS.maxBackdateDays * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);
    if (input.receivedOn > today || input.receivedOn < earliest) {
      return { outcome: 'INVALID', field: 'receivedOn' };
    }
    const backdated = input.receivedOn < today;
    if (backdated && !input.receivedOnReason) {
      return { outcome: 'INVALID', field: 'receivedOnReason' };
    }
    const receivedAt = backdated ? new Date(`${input.receivedOn}T00:00:00.000Z`) : input.now;
    const record = await this.deps.repo.createStaff({
      tenantId: input.tenantId,
      type: input.type,
      subjectEmail: input.email,
      capEmailHash: this.deps.tokens.capEmailHash(input.email),
      details: input.details,
      objectionScope: input.objectionScope,
      identityMethod: input.identityMethod,
      identityNote: input.identityNote,
      receivedAt,
      receivedOnReason: backdated ? input.receivedOnReason : null,
      verifiedAt: input.now,
      slaDeadline: addCalendarMonths(receivedAt, 1),
      createdById: input.actorId,
      // Written with the request, atomically: never a verified RESTRICTION without it.
      ...(input.type === 'RESTRICTION' ? { initialRestriction: { blocksMarketing: false } } : {}),
    });
    if (input.type === 'ERASURE') {
      // The person hears about a staff-logged erasure before it can run (security R3 S5),
      // and the erasure waits until that warning was actually accepted (codex).
      const noticed = await this.sendErasureNotice(record, input.firm.name, input.now);
      return { outcome: 'OK', record: noticed ?? record };
    }
    return { outcome: 'OK', record };
  }

  async extend(input: {
    tenantId: string;
    id: string;
    actorId: string;
    months: number;
    reason: string;
    now: Date;
  }): Promise<Ok | NotFound | Refused | Conflict> {
    const record = await this.deps.repo.findForTenant(input.tenantId, input.id);
    if (!record) return { outcome: 'NOT_FOUND' };
    if (!canExtend(record, input.months, input.now) || !record.slaDeadline) {
      return { outcome: 'REFUSED', reason: 'EXTENSION_NOT_ALLOWED' };
    }
    // Public requests run from verification; staff-logged ones from the date received.
    const clockStart = record.source === 'STAFF' ? record.receivedAt : record.verifiedAt;
    const extendedUntil = clockStart
      ? extendedDeadline(clockStart, input.months)
      : addCalendarMonths(record.slaDeadline, input.months);
    // The single extension is enforced in the conditional update, not only in canExtend:
    // two admins extending at once cannot both succeed (codex).
    const updated = await this.deps.repo.transition(
      input.tenantId,
      input.id,
      'VERIFIED',
      { extendedUntil, extensionReason: input.reason },
      { onlyIfNotExtended: true }
    );
    if (!updated) return { outcome: 'CONFLICT' };
    const firm = await this.deps.repo.findFirm(input.tenantId).catch(() => null);
    this.dispatch({
      kind: 'EXTENDED',
      to: record.subjectEmail,
      firmName: firm?.name ?? 'the firm',
      type: record.type,
      newDueDate: extendedUntil,
      reason: input.reason,
    });
    return { outcome: 'OK' };
  }

  async complete(input: {
    tenantId: string;
    id: string;
    actorId: string;
    note: string;
    noHoldConfirmed?: true;
    marketingStoppedConfirmed?: true;
    marketingStopMethod?: string;
    now: Date;
  }): Promise<Ok<{ erasure?: ErasureOutcome }> | NotFound | Conflict | Invalid | Refused> {
    const record = await this.deps.repo.findForTenant(input.tenantId, input.id);
    if (!record) return { outcome: 'NOT_FOUND' };
    if (record.status !== 'VERIFIED') return { outcome: 'CONFLICT' };
    if (EXPORT_TYPES.has(record.type)) return { outcome: 'INVALID', field: 'useCompleteAccess' };
    if (record.type === 'ERASURE') return this.completeErasure(record, input);

    const marketing = record.type === 'OBJECTION' && record.objectionScope === 'MARKETING';
    if (marketing && !(input.marketingStoppedConfirmed && input.marketingStopMethod)) {
      return { outcome: 'INVALID', field: 'marketingStopMethod' };
    }
    // An objection's restriction is written with the completion, atomically: if a rejection
    // won meanwhile, no restriction is left behind (codex).
    const done = await this.deps.repo.transition(
      input.tenantId,
      input.id,
      'VERIFIED',
      {
        status: 'COMPLETED',
        resolvedById: input.actorId,
        resolutionNote: input.note,
        completedAt: input.now,
        clockBreached: rejectionIsLate(record, input.now),
        ...(marketing ? { marketingStopMethod: input.marketingStopMethod } : {}),
      },
      record.type === 'OBJECTION'
        ? {
            restrict: {
              subjectEmail: record.subjectEmail,
              blocksMarketing: marketing,
              createdById: input.actorId,
            },
          }
        : undefined
    );
    if (!done) return { outcome: 'CONFLICT' };
    await this.notifyCompleted(record, marketing);
    return { outcome: 'OK' };
  }

  async completeAccess(input: {
    tenantId: string;
    id: string;
    actorId: string;
    note: string;
    withheld: Array<{ category: DsarWithheldCategory; count: number; reason: string }>;
    now: Date;
  }): Promise<Ok | NotFound | Conflict | Invalid> {
    const record = await this.deps.repo.findForTenant(input.tenantId, input.id);
    if (!record) return { outcome: 'NOT_FOUND' };
    if (!EXPORT_TYPES.has(record.type)) return { outcome: 'INVALID', field: 'type' };
    if (record.status !== 'VERIFIED') return { outcome: 'CONFLICT' };
    const resolutionNote = accessResolutionNote(input.note, input.withheld);
    if (resolutionNote.length > DSAR_LIMITS.noteMax) {
      return { outcome: 'INVALID', field: 'resolutionNoteLength' };
    }
    // What the person is told must match what is withheld now: the data can have changed since
    // the admin opened the dialog. Every category the export still withholds needs a count and
    // a reason, or the request would close with part of the copy neither sent nor explained.
    const live = await this.deps.subjectData.buildExport(record.tenantId, record.subjectEmail);
    if (!withheldIsExplained(live.withheld, input.withheld)) {
      return { outcome: 'INVALID', field: 'withheld' };
    }
    const done = await this.deps.repo.transition(input.tenantId, input.id, 'VERIFIED', {
      status: 'COMPLETED',
      resolvedById: input.actorId,
      resolutionNote,
      completedAt: input.now,
      clockBreached: rejectionIsLate(record, input.now),
    });
    if (!done) return { outcome: 'CONFLICT' };
    // The person is told what was withheld and why (Art 12(4), 15(4); codex).
    await this.notifyCompleted(record, false, input.withheld);
    return { outcome: 'OK' };
  }

  async reject(input: {
    tenantId: string;
    id: string;
    actorId: string;
    reason: string;
    now: Date;
  }): Promise<Ok<{ restrictionKept: boolean }> | NotFound | Conflict> {
    const record = await this.deps.repo.findForTenant(input.tenantId, input.id);
    if (!record) return { outcome: 'NOT_FOUND' };
    if (record.status !== 'VERIFIED') return { outcome: 'CONFLICT' };
    const late = rejectionIsLate(record, input.now);
    // The conditional change comes first, so a request another admin just completed is never
    // touched; if lifting fails afterwards the person stays restricted (the safe direction).
    // A rejected request's export link dies with it, in the same write (codex HIGH): an
    // access request with withheld data stays VERIFIED after its link was emailed.
    const done = await this.deps.repo.transition(input.tenantId, input.id, 'VERIFIED', {
      status: 'REJECTED',
      resolvedById: input.actorId,
      resolutionNote: input.reason,
      completedAt: input.now,
      clockBreached: late,
      exportTokenHash: null,
      exportExpiresAt: null,
    });
    if (!done) return { outcome: 'CONFLICT' };
    const firm = await this.deps.repo.findFirm(input.tenantId).catch(() => null);
    const firmName = firm?.name ?? 'the firm';
    let restrictionKept = false;
    if (record.type === 'RESTRICTION') {
      // Art 18(3): the person is told before the restriction is lifted. If the notice was not
      // accepted, the restriction stays (the safe direction) and the admin lifts it later.
      const told = await this.deps.notifications.send({
        kind: 'RESTRICTION_LIFTING',
        to: record.subjectEmail,
        firmName,
      });
      // The rejection has committed: a failed lift must not throw (the person would never get
      // the rejection, and a retry is a CONFLICT). The restriction then stays, the safe
      // direction, and the admin lifts it from the queue (codex).
      const lifted = told
        ? await this.deps.restrictions
            .liftForRequest({
              tenantId: input.tenantId,
              dsarRequestId: record.id,
              liftedById: input.actorId,
              note: `Request rejected: ${input.reason}`.slice(0, 500),
            })
            // null: nothing was lifted (another request still holds the restriction).
            .then((row) => row !== null)
            .catch(() => false)
        : false;
      restrictionKept = !lifted;
    }
    this.dispatch({
      kind: 'REJECTED',
      to: record.subjectEmail,
      firmName,
      type: record.type,
      reason: input.reason,
      late,
    });
    return { outcome: 'OK', restrictionKept };
  }

  async cancelErasure(input: {
    tenantId: string;
    id: string;
    actorId: string;
    reason: string;
    now?: Date;
  }): Promise<Ok | NotFound | Conflict | Invalid> {
    const now = input.now ?? new Date();
    const record = await this.deps.repo.findForTenant(input.tenantId, input.id);
    if (!record) return { outcome: 'NOT_FOUND' };
    if (record.type !== 'ERASURE') return { outcome: 'INVALID', field: 'type' };
    if (record.status !== 'VERIFIED') return { outcome: 'CONFLICT' };
    const done = await this.deps.repo.transition(input.tenantId, input.id, 'VERIFIED', {
      status: 'REJECTED',
      resolvedById: input.actorId,
      resolutionNote: `Cancelled: ${input.reason}`,
      completedAt: now,
      // A cancellation after the deadline answers the request late, like a rejection (codex).
      clockBreached: rejectionIsLate(record, now),
    });
    if (!done) return { outcome: 'CONFLICT' };
    const firm = await this.deps.repo.findFirm(input.tenantId).catch(() => null);
    this.dispatch({
      kind: 'ERASURE_CANCELLED',
      to: record.subjectEmail,
      firmName: firm?.name ?? 'the firm',
      reason: input.reason,
    });
    return { outcome: 'OK' };
  }

  async liftRestriction(input: {
    tenantId: string;
    restrictionId: string;
    actorId: string;
    note: string;
  }): Promise<Ok | NotFound | Refused | Conflict> {
    const active = await this.deps.restrictions.findActive(input.tenantId, input.restrictionId);
    if (!active) return { outcome: 'NOT_FOUND' };
    const firm = await this.deps.repo.findFirm(input.tenantId);
    // Art 18(3): tell the person first, and lift only once the notice was accepted.
    const told = await this.deps.notifications.send({
      kind: 'RESTRICTION_LIFTING',
      to: active.subjectEmail,
      firmName: firm?.name ?? 'the firm',
    });
    if (!told) return { outcome: 'REFUSED', reason: 'NOTICE_NOT_SENT' };
    const lifted = await this.deps.restrictions.lift({
      tenantId: input.tenantId,
      restrictionId: input.restrictionId,
      // Only what the admin saw: a request merged in meanwhile keeps it in force.
      expectedRequestIds: active.dsarRequestIds,
      liftedById: input.actorId,
      note: input.note,
    });
    return lifted ? { outcome: 'OK' } : { outcome: 'CONFLICT' };
  }

  async revokeExport(input: {
    tenantId: string;
    id: string;
    actorId: string;
  }): Promise<Ok | NotFound | Conflict> {
    const record = await this.deps.repo.findForTenant(input.tenantId, input.id);
    if (!record) return { outcome: 'NOT_FOUND' };
    const done = await this.deps.repo.transition(input.tenantId, input.id, record.status, {
      exportTokenHash: null,
      exportExpiresAt: null,
    });
    return done ? { outcome: 'OK' } : { outcome: 'CONFLICT' };
  }

  /** Staff-handled access/portability: the same export, for the admin to send. */
  async exportData(input: {
    tenantId: string;
    id: string;
    now: Date;
  }): Promise<Ok<{ export: DsarExport }> | NotFound | Invalid> {
    const record = await this.deps.repo.findForTenant(input.tenantId, input.id);
    if (!record) return { outcome: 'NOT_FOUND' };
    if (
      !EXPORT_TYPES.has(record.type) ||
      record.status === 'PENDING_VERIFICATION' ||
      record.status === 'REJECTED'
    ) {
      return { outcome: 'INVALID', field: 'type' };
    }
    return { outcome: 'OK', export: await this.buildExport(record, input.now) };
  }

  /** Counts for the erasure dialog, by request so the admin never types an email to probe. */
  async previewErasure(input: {
    tenantId: string;
    id: string;
  }): Promise<Ok<{ preview: ErasureOutcome }> | NotFound | Invalid> {
    const record = await this.deps.repo.findForTenant(input.tenantId, input.id);
    if (!record) return { outcome: 'NOT_FOUND' };
    if (record.type !== 'ERASURE') return { outcome: 'INVALID', field: 'type' };
    return {
      outcome: 'OK',
      preview: await this.deps.subjectData.previewErasure(input.tenantId, record.subjectEmail),
    };
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private async completeErasure(
    record: DsarRecord,
    input: { tenantId: string; actorId: string; note: string; noHoldConfirmed?: true; now: Date }
  ): Promise<Ok<{ erasure: ErasureOutcome }> | Conflict | Invalid | Refused> {
    if (!input.noHoldConfirmed) return { outcome: 'INVALID', field: 'noHoldConfirmed' };
    if (record.source === 'STAFF') {
      // No erasure until the person was warned; a failed warning is retried here, and the
      // single-admin pause counts from the warning, not from logging.
      let noticeAt = record.erasureNoticeAt;
      if (!noticeAt) {
        const firm = await this.deps.repo.findFirm(input.tenantId);
        const noticed = await this.sendErasureNotice(record, firm?.name ?? 'the firm', input.now);
        if (!noticed?.erasureNoticeAt) {
          return { outcome: 'REFUSED', reason: 'ERASURE_NOTICE_NOT_SENT' };
        }
        noticeAt = noticed.erasureNoticeAt;
      }
      const decision = staffErasureMayRun({
        adminCount: await this.deps.repo.countAdmins(input.tenantId),
        createdById: record.createdById,
        resolvedById: input.actorId,
        createdAt: noticeAt,
        now: input.now,
      });
      if (!decision.allowed) return { outcome: 'REFUSED', reason: decision.reason };
    }
    const erased = await this.deps.subjectData.erase({
      tenantId: input.tenantId,
      requestId: record.id,
      subjectEmail: record.subjectEmail,
      resolvedById: input.actorId,
      note: input.note,
      now: input.now,
      clockBreached: rejectionIsLate(record, input.now),
    });
    if (erased.outcome === 'NOT_PENDING') return { outcome: 'CONFLICT' };
    await this.notifyCompleted(record, false);
    return { outcome: 'OK', erasure: erased.result };
  }

  /** Warn the person of a staff-logged erasure; record when the warning was accepted. */
  private async sendErasureNotice(
    record: DsarRecord,
    firmName: string,
    now: Date
  ): Promise<DsarRecord | null> {
    const told = await this.deps.notifications.send({
      kind: 'ERASURE_LOGGED',
      to: record.subjectEmail,
      firmName,
    });
    if (!told) return null;
    return this.deps.repo.transition(record.tenantId, record.id, 'VERIFIED', {
      erasureNoticeAt: now,
    });
  }

  /**
   * Email the export link. The token is stored first (so the link works the moment it
   * arrives), and the request is marked issued, or completed when nothing was withheld, only
   * after the provider accepted the email. If it was not accepted the token is cleared and the
   * request stays VERIFIED: the admin sees an open access request with no export issued and
   * answers it with `exportData` and `completeAccess`.
   */
  private async issueExport(record: DsarRecord, firm: DsarFirm, now: Date): Promise<boolean> {
    if (!firm.handle) return false;
    const snapshot = await this.deps.subjectData.buildExport(record.tenantId, record.subjectEmail);
    const completes = accessCompletesAtVerify(snapshot.withheld);
    const { token, hash } = this.deps.tokens.issue();
    const expiresAt = new Date(now.getTime() + DSAR_LIMITS.exportHours * MS_PER_HOUR);
    const stored = await this.deps.repo.transition(record.tenantId, record.id, 'VERIFIED', {
      exportTokenHash: hash,
      exportExpiresAt: expiresAt,
    });
    if (!stored) return false;
    const delivered = await this.deps.notifications.send({
      kind: 'EXPORT_LINK',
      to: record.subjectEmail,
      firmName: firm.name,
      link: this.link(firm.handle, 'export', record.id, token),
      expiresAt,
      withheld: !completes,
    });
    if (!delivered) {
      await this.deps.repo.transition(record.tenantId, record.id, 'VERIFIED', {
        exportTokenHash: null,
        exportExpiresAt: null,
      });
      return false;
    }
    await this.deps.repo.transition(record.tenantId, record.id, 'VERIFIED', {
      exportIssuedAt: now,
      ...(completes ? { status: 'COMPLETED' as const, completedAt: now } : {}),
    });
    return true;
  }

  private async buildExport(record: DsarRecord, now: Date): Promise<DsarExport> {
    const firm = await this.deps.repo.findFirm(record.tenantId);
    const snapshot = await this.deps.subjectData.buildExport(record.tenantId, record.subjectEmail);
    return {
      generatedAt: now.toISOString(),
      processingInformation: processingInformation(firm),
      data: snapshot.data,
      withheld: Object.entries(snapshot.withheld)
        .filter(([, count]) => (count ?? 0) > 0)
        .map(([category, count]) => ({
          category: category as DsarWithheldCategory,
          count: count ?? 0,
          note: record.status === 'COMPLETED' ? WITHHELD_FINAL_NOTE : WITHHELD_NOTE,
        })),
    };
  }

  private async notifyCompleted(
    record: DsarRecord,
    marketingStopped: boolean,
    withheld: ReadonlyArray<{ category: DsarWithheldCategory; count: number; reason: string }> = []
  ): Promise<void> {
    // Runs after the request has committed: a failed lookup must not throw, or the caller loses
    // the result it can no longer get again (an erasure's checklist; a retry is a CONFLICT).
    const firm = await this.deps.repo.findFirm(record.tenantId).catch(() => null);
    this.dispatch({
      kind: 'COMPLETED',
      to: record.subjectEmail,
      firmName: firm?.name ?? 'the firm',
      type: record.type,
      marketingStopped,
      withheld,
    });
  }

  /** Links carry the id and token in the fragment only, which browsers never send to servers. */
  private link(handle: string, page: 'verify' | 'export', id: string, token: string): string {
    return `${this.deps.appUrl()}/dsar/${encodeURIComponent(handle)}/${page}#r=${id}.${token}`;
  }

  /** Fire and forget; the port never throws, the catch only guards an unexpected rejection. */
  private dispatch(notice: DsarNotice): void {
    this.deps.notifications.send(notice).catch(() => false);
  }
}

/**
 * Every category withheld right now has an entry with a reason and a count that covers what is
 * withheld now: a record added after the admin's review must not go unaccounted for (codex).
 */
function withheldIsExplained(
  live: Partial<Record<DsarWithheldCategory, number>>,
  given: ReadonlyArray<{ category: DsarWithheldCategory; count: number; reason: string }>
): boolean {
  return Object.entries(live).every(([category, count]) => {
    if (!count) return true;
    return given.some(
      (g) => g.category === category && g.count >= count && g.reason.trim().length > 0
    );
  });
}

/** Art 15(1) information. Retention and transfers are the controller's: we point to its notice. */
function processingInformation(firm: DsarFirm | null): DsarExport['processingInformation'] {
  return {
    controller: { name: firm?.name ?? 'The firm', privacyUrl: firm?.privacyUrl ?? null },
    purposes: [
      'Managing enquiries, appointments and client relationships',
      'Legal services and the firm’s legal and regulatory obligations',
    ],
    categories: [
      'Identity and contact details',
      'Enquiry, booking and appointment details',
      'Records of contact with the firm',
      'Deals and tasks the firm keeps about you',
      'Scores and insights generated by AI from your enquiry (derived data)',
    ],
    recipients: [
      'The firm’s CRM provider (Aurora) as processor, and its sub-processors for hosting, database and email delivery',
      'An AI provider used to score enquiries, as processor',
    ],
    // No notice published: say so and point the person to the firm, with no invented periods.
    retention: firm?.privacyUrl
      ? `See ${firm.privacyUrl} for how long each category is kept.`
      : 'The firm has not published a privacy notice that says how long each category is kept. You can ask the firm directly.',
    source:
      'You, through forms, bookings and correspondence; the firm’s staff; and AI-derived scores.',
    rights: [
      'Access (Art 15)',
      'Rectification (Art 16)',
      'Erasure (Art 17)',
      'Restriction (Art 18)',
      'Portability (Art 20)',
      'Objection (Art 21)',
    ],
    complaint:
      'You can complain to the Information Commissioner’s Office (ico.org.uk) and seek a judicial remedy.',
    automatedDecisions:
      'AI is used to score enquiries for the firm’s staff. For a new enquiry, a high score can set a lead’s status to qualified and a low score to unqualified without a person first looking at it; that is an internal label, and staff make the decisions that affect you. No decision with legal or similarly significant effect is made solely by automated means. International transfer safeguards are described in the firm’s privacy notice.',
  };
}
