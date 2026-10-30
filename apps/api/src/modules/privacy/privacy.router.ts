/**
 * The `privacy` router (PG-203 DSAR, spec Addendum A "Routing").
 *
 * One key for the client: the public data request procedures (`privacy.getFirm`,
 * `privacy.submit`, `privacy.verify`, `privacy.downloadExport`), the member banner read
 * (`privacy.restrictionFor`) and the ADMIN-only handling (`privacy.admin.*`).
 */
import { createTRPCRouter } from '../../trpc';
import { privacyPublicProcedures } from './privacy-public.router';
import { privacyAdminRouter, restrictionForProcedure } from './privacy-admin.router';

export const privacyRouter = createTRPCRouter({
  ...privacyPublicProcedures,
  restrictionFor: restrictionForProcedure,
  admin: privacyAdminRouter,
});
