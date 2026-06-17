import type { Metadata } from 'next';
import { getAccessToken, createCallerFromToken } from '@/lib/trpc-server';
import { serializeForClient } from '@/lib/shared/serialize-for-client';
import { fetchHelpArticlesFirstPage } from '@/lib/cached-queries/help-article-queries';
import { ArticleAdminList, ForbiddenSurface } from '@/components/support/article-admin-list';
import type { Role } from '@/components/support/article-admin-columns';

export const metadata: Metadata = {
  title: 'Help Articles — Admin',
  description: 'Manage help center articles for your tenant.',
};

const PRIVILEGED_ROLES = new Set<string>(['ADMIN', 'MANAGER']);

export default async function HelpArticleAdminListPage() {
  const token = await getAccessToken();
  if (!token) {
    return <ForbiddenSurface />;
  }

  let role: string | undefined;
  try {
    const caller = await createCallerFromToken(token);
    const profile = await caller.user.getProfile.query();
    role = profile.role;
  } catch {
    return <ForbiddenSurface />;
  }

  if (!role || !PRIVILEGED_ROLES.has(role)) {
    return <ForbiddenSurface />;
  }

  let initialData: unknown = null;
  try {
    initialData = serializeForClient(await fetchHelpArticlesFirstPage(token));
  } catch {
    // Non-fatal — client island re-queries on mount.
  }

  return <ArticleAdminList initialData={initialData} role={role as Role} />;
}
