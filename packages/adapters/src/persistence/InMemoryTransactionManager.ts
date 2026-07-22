import type { TransactionPort } from '@intelliflow/application';
import type { RepositoryTransaction } from '@intelliflow/domain';

/**
 * In-memory {@link TransactionPort} for unit tests and non-DB wiring.
 *
 * There is no real transaction: it simply invokes `work` with a sentinel
 * handle. The in-memory repository adapters ignore the transaction argument, so
 * behaviour is identical to calling the writes directly — while still
 * exercising the same `run(tx => …)` code path the production use cases use.
 *
 * NOTE: it provides NO atomicity. Tests that must prove real rollback behaviour
 * use `PrismaTransactionManager` against the test database instead.
 */
export class InMemoryTransactionManager implements TransactionPort {
  async run<T>(work: (tx: RepositoryTransaction) => Promise<T>): Promise<T> {
    return work({} as RepositoryTransaction);
  }
}
