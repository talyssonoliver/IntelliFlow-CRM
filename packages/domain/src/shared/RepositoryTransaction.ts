/**
 * Opaque transaction handle threaded through repository writes.
 *
 * A use case can span multiple aggregate `save()` calls (and the domain-event
 * outbox) inside ONE database transaction by opening a {@link TransactionPort}
 * and passing the resulting handle to each repository. The domain and
 * application layers treat this handle as **opaque** — they never import the
 * concrete Prisma client, so the hexagonal boundary enforced by
 * `tests/architecture/application-dependencies.test.ts`
 * (application MUST NOT depend on `@intelliflow/db`) is preserved.
 *
 * The concrete value is a Prisma `TransactionClient`, supplied by the
 * infrastructure adapter (`PrismaTransactionManager`) and cast back inside the
 * Prisma repository adapters. When no transaction is threaded, repositories use
 * their own client, so the parameter is always optional and fully
 * backward-compatible.
 */
export interface RepositoryTransaction {
  /**
   * Brand to stop arbitrary objects being passed where a transaction handle is
   * expected. Never read at runtime — the real value is a `TransactionClient`.
   */
  readonly __repositoryTransaction?: 'RepositoryTransaction';
}
