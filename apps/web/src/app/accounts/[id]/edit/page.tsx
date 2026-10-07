import EditAccountForm from './EditAccountForm';

/**
 * Edit Account route (PG-197). Thin route entry; the logic lives in the
 * co-located, unit-tested `EditAccountForm`. Reached from the Edit buttons on
 * the account detail page and the accounts list.
 */
export default async function EditAccountPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 pt-8 pb-16">
      <EditAccountForm accountId={id} />
    </div>
  );
}
