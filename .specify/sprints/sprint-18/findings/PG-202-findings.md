# PG-202 findings (Availability, 2026-10-17)

Red flags and out-of-scope defects found while building firm availability. Each is fixed in this task or tracked in
all three surfaces (gh issue, `artifacts/metrics/debt-ledger.yaml`, this file).

## Fixed in PG-202

| # | Finding | Evidence | Fix |
|---|---|---|---|
| F1 | `/calendar/availability` was a "coming soon" stub while the sidebar linked to it. | old `apps/web/src/app/calendar/availability/page.tsx` | Real page (server shell + `AvailabilityContent`), `page.test.tsx` asserts no "coming soon" |
| F2 | Firm hours were hard-coded 07:00-19:00 in two places: the server (`appointments.router.ts` `assertWithinBusinessHours`) and a client copy in `AppointmentForm.tsx:118-138`. The client copy would contradict saved hours. | old `AppointmentForm.tsx:118-138` | Server-only via `availability-enforcement.ts`; the client rule is deleted and server rejections are shown in `role="alert"` (`form-submit-error`) |
| F3 | Buffers and the timezone were edited on Calendar Settings. The owner ruled one source of truth, edited on Availability (Q2). | `CalendarSettingsContent.tsx`, `BufferRemindersTab.tsx`, `CalendarIntegrationTab.tsx` | Read-only pointer + link (`AvailabilityPointer.tsx`); payload, `mapSettings` and `normalize` no longer carry them; the update schema omits them |
| F4 | Appointment-settings reset also reset buffers and the timezone. | old `appointment-settings.router.ts` reset | `APPOINTMENT_SETTINGS_RESET_FIELDS` (durations, reminder, sync) + `primaryCalendarId: null`; reset text says what is kept |
| F5 | New appointments always started with 0/0 buffers, ignoring the firm defaults. | old `AppointmentForm.tsx:73-78` | `defaultBuffers` from `appointmentSettings.get` (owner Q7); a non-preset default gets its own option |
| F6 | `AppointmentDetail.handleAction` closed the dialog and cleared the input even when the action failed. The rejection was unhandled and the user saw nothing. | old `AppointmentDetail.tsx:89-97` | Dialog closes only on success; the message shows in `role="alert"`, input kept; quick-action failures too |
| F7 | The `AppointmentDetail` modal backdrop had `aria-hidden="true"`, hiding the whole dialog (and any alert in it) from assistive technology. | old `AppointmentDetail.tsx:550` | Removed; Escape handled by a document listener while a dialog is open |
| F8 | `ConfirmationDialog` always returned focus to its trigger, so a page could not move focus after a destructive confirm. | `packages/ui/src/components/confirmation-dialog.tsx` | Optional `onCloseAutoFocus` (additive, tested) |
| F9 | Sonar guard on the PG-202 diff: cognitive complexity in `evaluateAvailability` (17), `generateCandidates` (26), `AvailabilityContent` (17) and the API test helper (16); nested ternaries; a nested template literal; `role="region"` on cards; a non-native interactive backdrop. | `lint-sonar-guard.ts` with `SONAR_GUARD_FILES` | All fixed before the first commit; integration SQL now uses positional parameters |

| F10 | Codex: on the autumn DST night, checking only the endpoints accepted a booking that passes through closed time in the repeated hour (e.g. hours 01:30-02:00, booking 00:45Z-01:15Z London). | `AvailabilityPolicy.ts` `checkWeeklyHours` | Split at the offset change (`wallClockSegments`); every segment must be open; RED/GREEN `*-domain-dst-fold.log` |
| F11 | Codex: the slot search skipped valid slots in the repeated autumn hour and could repeat a slot in the spring gap. | `AvailabilityPolicy.ts` slot generator | `dayGridStarts`: both occurrences, deduped, sorted; fit judged by elapsed time; RED/GREEN `*-domain-dst-slots.log` |
| F12 | Codex: a saved all-day range (0-1440) loaded as an invalid "00:00-00:00" and blocked every later save. | `availability-draft.ts` `rangeMinutes` | An end of 00:00 is always midnight, so 00:00-00:00 is the whole day; RED/GREEN `*-web-allday.log` |
| F13 | Codex: `findFirstFreeCandidate` read existing appointments by raw times, missing one whose own after-buffer runs into the candidate. | `CheckConflicts.ts` | Read widened by `Buffer.MAX_MINUTES`; RED/GREEN `*-application-existing-buffer.log` |
| F14 | Codex: edits made while a save was in flight were overwritten by the response. | `AvailabilityContent.tsx` `handleSave` | Later edits kept, only the saved baseline moves; RED/GREEN `*-web-inflight-save.log` |

| F15 | a11y review F1 (1.4.3): the Availability pointer link was `text-primary` on slate-50, 3.97:1 light / 3.52:1 dark. | `AvailabilityPointer.tsx:9` | `text-blue-700 dark:text-blue-300` |
| F16 | a11y review F2 (2.4.3): after a CONFLICT Reload the focused banner unmounted and focus fell to `<body>`. | `AvailabilityContent.tsx` `handleReload` | Focus moves to the Weekly hours title (spec line 370); asserted in the CONFLICT test |
| F17 | a11y review F3 (4.1.2): with `aria-hidden` gone, the detail `<dialog>` had no accessible name. | `AppointmentDetail.tsx:579` | `aria-labelledby` on the dialog's title; test finds `dialog` by name |
| F18 | a11y review F4: a failed Reset returned focus to the Reset button instead of the error. | `AvailabilityContent.tsx` `confirmReset` | `onCloseAutoFocus` focuses the error banner; asserted in the failed-reset test |
| F19 | a11y review F8: Escape closed the detail dialog while its action was still running. | `AppointmentDetail.tsx` Escape listener | Listener off while `isActionLoading`; test |

## Tracked (out of scope)

| # | Finding | gh issue | Debt ledger |
|---|---|---|---|
| T1 | Legacy 07:00-19:00 rule accepts an appointment that runs past midnight (start and end hours checked separately). Kept unchanged on purpose for firms that never saved availability. | #909 | `PG-202-LEGACY-HOURS-CROSS-MIDNIGHT-001` |
| T2 | `appointment_settings` RLS policy has `USING` but no `WITH CHECK`. | #910 | `PG-202-APPOINTMENT-SETTINGS-RLS-WITH-CHECK-001` |
| T3 | `AppointmentSettings.defaultTimezone` defaults to `UTC`; ADR-044 names Europe/London. | #911 | `PG-202-DEFAULT-TIMEZONE-UTC-001` |
| T4 | Design registries list `/calendar/new` and `/calendar/[id]`, which do not exist. | #912 | `PG-202-STALE-CALENDAR-REGISTRY-ROWS-001` |
| T5 | Known limits accepted in ADR-081: recurring series checked on the first occurrence only; `findNextSlot` has no UI caller; the daily cap is best-effort (Codex HIGH, waived in `tools/audit/codex-review-waivers.yaml` with this evidence, author marked pending owner confirmation). The legacy `CheckConflictsUseCase.findNextSlot` (pre-existing, unconfigured tenants) has the same existing-buffer read gap fixed in F13 for the new path. | #913 | `PG-202-AVAILABILITY-KNOWN-LIMITS-001` |
| T6 | a11y review F5/F6: unchecked Switch track 1.24:1 (1.4.11) and white on primary 4.15:1. Shared tokens, pre-existing. | #871 (comment added) | (owned by #871) |
| T7 | a11y review F7 (minor): after a failed Save the validation summary re-announces its count on each edit; F12: axe in jsdom skips colour contrast and does not cover the detail dialog or the pointer. | (recorded here; minor) | (none) |

## Notes

- `artifacts/reports/content-audit-results.json` needed no change: the `/calendar/availability` entry keeps the same file
  path and layout metadata, with no stale-content flag.
- `getAvailableTimezones` (`apps/web/src/lib/shared/timezone-utils.ts:354`) lost its only production caller when the
  Calendar Integration tab stopped editing the timezone. It is still covered by its own tests and `knip` does not flag it,
  so it was left in place.
- The debt-ledger `summary` already lagged the item list on `origin/main` (summary 426, items 445 before PG-202). PG-202
  added +5 to the summary the same way PG-204 did and did not rewrite the global totals, which other lanes also edit.
