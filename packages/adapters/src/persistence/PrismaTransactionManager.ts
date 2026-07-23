import { withTransaction, type TransactionClient } from '@intelliflow/db';
import type { TransactionPort } from '@intelliflow/application';
import type { RepositoryTransaction } from '@intelliflow/domain';

/**
 * Prisma-backed {@link TransactionPort}.
 *
 * Wraps `@intelliflow/db`'s `withTransaction` so the application layer can open
 * a real database transaction without importing the DB package directly. The
 * Prisma `TransactionClient` is handed to the caller as an opaque
 * {@link RepositoryTransaction}; the Prisma repository adapters cast it back.
 */
export class PrismaTransactionManager implements TransactionPort {
  async run<T>(work: (tx: RepositoryTransaction) => Promise<T>): Promise<T> {
    return withTransaction((tx: TransactionClient) => work(tx as unknown as RepositoryTransaction));
  }
}
