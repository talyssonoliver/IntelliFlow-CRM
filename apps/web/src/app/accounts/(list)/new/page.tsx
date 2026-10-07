import NewAccountForm from './NewAccountForm';

/**
 * New Account route (PG-197). The form logic lives in the co-located client
 * component `NewAccountForm` so it is unit-test-measured; this file is the
 * thin route entry. Linked from the accounts list "New Account" CTA and the
 * dashboard quick-create menu.
 */
export default function NewAccountPage() {
  return <NewAccountForm />;
}
