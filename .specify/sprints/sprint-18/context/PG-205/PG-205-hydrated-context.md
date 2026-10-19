# PG-205 hydrated context (structured audits)

Compiled 2026-10-18T09:50:59Z by the /exec recovery lane (session ffa3728c). The workflow audit reported that the
shared-component and route-conflict audit keys were missing.

The /spec-session did this analysis, but it recorded it only in the spec (the "Web" reuse-tag table, Runtime
Wiring, Navigation & Reachability) and in the findings doc (F2-F4). This file and `PG-205-hydrated-context.json`
transcribe that analysis without adding decisions.

The generated hydration output is `hydrated-context.json` / `hydrated-context.md` (context-hydration.ts,
2026-10-17T14:44:39.900Z).

- Shared component audit: 9 reuse decisions (PageHeader, SectionHeader, EmptyState, SearchFilterBar reused;
  Badge and AlertDialog composed; colour map imported; DefaultTagPicker and ContactTypeSelect new, justified).
- Route conflict audit: 3 conflicts (the stub page replaced in place, fake type options replaced, dead sidebar
  segment links wired).
