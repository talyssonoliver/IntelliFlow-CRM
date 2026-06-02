# ADR-056: Audit Hash-Chain Concurrency Policy

**Status:** Proposed

**Date:** 2026-05-31

**Deciders:** Backend Lead, Security Lead — _pending ratification._

**Technical Story:** Race-condition finding RACE-AUDIT-01 (see
`docs/operations/property-testing/race-condition-findings.json`); regression
test `tests/property/concurrency/audit-hash-chain.prop.test.ts`. Builds on
[ADR-008](./ADR-008-audit-logging.md) (audit logging) and
[ADR-054](./ADR-054-property-based-race-condition-testing.md).

## Context and Problem Statement

`DurableAuditLogAdapter` (packages/adapters/src/audit) maintains a
tamper-evident HMAC-SHA256 hash chain: each event stores the `integrityHash` of
its predecessor as `previousHash`. The chain head was held in a **mutable
instance field** (`previousHash`), read into an entry _before_ the persistence
`await` and advanced _after_ it.

Under concurrency this forks the chain: two concurrent `logSecurityEvent` calls
both read the same predecessor (e.g. `GENESIS`) before either advances it, then
persist sibling events that both claim the same `previousHash`. The chain is no
longer a chain, defeating tamper-evidence — a Critical integrity defect
(RACE-AUDIT-01). The property test reproduced it deterministically
(`GENESIS×2`).

## Decision

**Serialize chain appends within an adapter instance via a promise-chain
mutex.** `logSecurityEvent` and `logBatchEvents` enqueue their critical section
on a shared `chainTail` promise, so the `read previousHash → persist → advance`
sequence is atomic with respect to other appends. The tail is kept alive on both
success and failure so a single rejected append never wedges the queue.

This restores the chain's intended single-writer invariant with no change to the
public `AuditLogPort` contract, no schema migration, and no reduction in test
rigor (it is mutual exclusion on shared mutable state — the textbook fix for an
in-process data race — not a timeout/run-count workaround).

## Scope and Limitations (explicit)

This fix guarantees a sound chain for a **single adapter instance / process**,
which matches the current deployment (the audit logger is instantiated once per
API process). It does **not** by itself guarantee a single global chain across
**multiple processes/instances**, because each instance keeps its own in-memory
head. That is a pre-existing limitation, now documented rather than silently
assumed away.

A future ADR will address multi-process integrity by deriving the chain head
from the database inside the persistence transaction — e.g. a per-tenant
`chain_head` row taken `SELECT … FOR UPDATE`, or a serializable transaction — so
links are computed from committed state. That is a larger change (expands the
`AuditPrismaClient` port and the chain model to be per-tenant) and is
intentionally out of scope here to keep the Critical fix small and reviewable.

## Consequences

- **Positive:** Critical chain-fork race eliminated for the live deployment; no
  API or schema change; deterministic regression test guards it.
- **Negative / neutral:** appends within an instance are serialized (audit
  logging is low-throughput relative to request volume, so the latency impact is
  negligible); multi-process chain unification remains future work.

## Alternatives Considered

- **DB-derived chain head now** (per-tenant `chain_head` + row lock): the
  fully-correct multi-process solution, deferred as a larger redesign (above).
- **Serializable transaction per append:** also serializes but adds retry/abort
  handling and a port change; heavier than needed for the in-process Critical.
- **Leave as-is / document only:** rejected — the fork is a Critical
  tamper-evidence defect reachable under normal concurrent load.
