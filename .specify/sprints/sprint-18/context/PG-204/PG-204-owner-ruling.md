# PG-204 owner ruling (2026-10-13, AskUserQuestion modal, Talysson)

Q1 What does a case type do once configured?
-> A: applied at case creation. New CaseType table (name, category, colour, default priority, default SLA days,
   required fields, resolution checklist, active/default flags); Case gets optional caseTypeId; New Case form gets a
   type picker; server fills blank priority/deadline (today + SLA days) from the type, enforces the type's required
   fields, and seeds the type's resolution checklist as CaseTasks. Additive Prisma migration (manual prod apply, L13).

Q2 With no type picked, should case creation also apply PG-190 defaultPriority and required fields?
-> Yes: one consistent rule (type first, then PG-190 module defaults).
