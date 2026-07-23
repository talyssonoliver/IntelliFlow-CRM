import { RepositoryTransaction } from '@intelliflow/domain';

/**
 * Transaction Port (Unit-of-Work boundary).
 *
 * Lets an application use case run several repository writes — and the
 * domain-event outbox — inside a single database transaction, without the
 * application layer importing the infrastructure (`@intelliflow/db`). The
 * concrete implementation (`PrismaTransactionManager`) wraps
 * `withTransaction` and hands back an opaque {@link RepositoryTransaction}
 * that each repository's `save(..., tx)` / `publishAll(..., tx)` accepts.
 *
 * Introduced for ENG-OPS-002 DDD-001 / DDD-002 (transactional integrity):
 * cross-aggregate conversion and aggregate-save + event-emit must commit or
 * roll back together (ADR-002 aggregate boundaries, ADR-011 zero-lost-events).
 */
export interface TransactionPort {
  /**
   * Run `work` inside a single transaction. All repository writes that receive
   * the provided `tx` commit atomically; if `work` throws, the whole
   * transaction rolls back and nothing is persisted.
   */
  run<T>(work: (tx: RepositoryTransaction) => Promise<T>): Promise<T>;
}
