'use client';

/**
 * Email signatures (PG-207, owner rulings Q2/Q5): each user's own signatures
 * and the organisation's, one default per owner. Compose pre-fills the
 * default (user's, else the organisation's) for new messages; the server
 * never appends one. Organisation signatures are managed by admins and
 * managers; everyone can read them.
 */
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import DOMPurify from 'isomorphic-dompurify';
import { Badge, Button, Card, ConfirmationDialog, EmptyState, toast } from '@intelliflow/ui';
import type { EmailSignatureDto } from '@intelliflow/validators';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { SectionHeader } from '@/components/shared/section-header';
import { SignaturesLoading } from './SignaturesLoading';
import type {
  SignatureDialogTarget,
  SignatureSaveInput,
  SignatureSaveResult,
} from './components/SignatureDialog';

// Loaded on demand: it carries the rich-text editor (NF-005).
const SignatureDialog = dynamic(
  () => import('./components/SignatureDialog').then((m) => m.SignatureDialog),
  { ssr: false }
);

type Scope = 'USER' | 'ORG';

const BREADCRUMBS = [{ label: 'Email', href: '/email' }, { label: 'Signatures' }];
const TITLE_IDS: Record<Scope, string> = {
  USER: 'signatures-mine-title',
  ORG: 'signatures-org-title',
};

function errorCode(error: unknown): string | undefined {
  const data = (error as { data?: { code?: unknown } } | null)?.data;
  return typeof data?.code === 'string' ? data.code : undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Please try again.';
}

function SignaturePreview({ html }: Readonly<{ html: string }>) {
  // Server-sanitised already; sanitised again before it touches the DOM.
  return (
    <div
      className="prose prose-sm max-w-none text-muted-foreground line-clamp-3 dark:prose-invert"
      // A preview only: links in it must not be tabbable behind the clamp.
      inert
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
    />
  );
}

interface SignatureListProps {
  scope: Scope;
  signatures: EmailSignatureDto[];
  canManage: boolean;
  busy: boolean;
  onEdit: (signature: EmailSignatureDto) => void;
  onDelete: (signature: EmailSignatureDto) => void;
  onSetDefault: (signature: EmailSignatureDto) => void;
}

function SignatureList({
  scope,
  signatures,
  canManage,
  busy,
  onEdit,
  onDelete,
  onSetDefault,
}: Readonly<SignatureListProps>) {
  if (signatures.length === 0) {
    return (
      <EmptyState
        entity="signatures"
        size="sm"
        phase="passive"
        title={scope === 'USER' ? 'No personal signatures yet' : 'No organisation signatures yet'}
        description={
          scope === 'USER'
            ? 'Create one to have it added when you write a new email.'
            : 'An organisation signature is used by anyone without a default of their own.'
        }
        className="py-4 px-3 gap-2"
      />
    );
  }
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {signatures.map((signature) => (
        <li key={signature.id} className="px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{signature.name}</span>
            {signature.isDefault && <Badge variant="secondary">Default</Badge>}
            {canManage && (
              <div className="ml-auto flex flex-wrap gap-1">
                {!signature.isDefault && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => onSetDefault(signature)}
                  >
                    Make Default <span className="sr-only">for {signature.name}</span>
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(signature)}>
                  Edit <span className="sr-only">{signature.name}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onDelete(signature)}
                >
                  Delete <span className="sr-only">{signature.name}</span>
                </Button>
              </div>
            )}
          </div>
          <SignaturePreview html={signature.html} />
        </li>
      ))}
    </ul>
  );
}

export default function SignaturesContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const enabled = isAuthenticated && !authLoading;
  const utils = trpc.useUtils();
  const listQuery = trpc.emailSignatures.list.useQuery(undefined, { enabled });
  const createMutation = trpc.emailSignatures.create.useMutation();
  const updateMutation = trpc.emailSignatures.update.useMutation();
  const deleteMutation = trpc.emailSignatures.delete.useMutation();
  const setDefaultMutation = trpc.emailSignatures.setDefault.useMutation();

  const [dialog, setDialog] = useState<SignatureDialogTarget | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Each opening is a fresh form: the dialog stays mounted while it closes.
  const [dialogInstance, setDialogInstance] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<EmailSignatureDto | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // Delete and Make Default remove the button that had focus: focus moves to
  // the section heading instead.
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const deletedScopeRef = useRef<Scope | null>(null);

  useEffect(() => {
    if (!focusTarget) return;
    document.getElementById(focusTarget)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  const refresh = () => {
    utils.emailSignatures.invalidate().catch((error: unknown) => {
      console.error('[signatures] refresh failed:', error);
    });
  };

  if (authLoading || listQuery.isLoading) return <SignaturesLoading />;

  if (listQuery.error || !listQuery.data) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6">
          <PageHeader breadcrumbs={BREADCRUMBS} title="Signatures" className="mb-6" />
          <div className="w-full text-center py-12">
            <p className="text-red-700 dark:text-red-300 mb-4" role="alert">
              Failed to load signatures{listQuery.error ? `: ${listQuery.error.message}` : '.'}
            </p>
            <Button type="button" variant="outline" onClick={() => listQuery.refetch()}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { mine, org, canManageOrg } = listQuery.data;
  const busy = deleteMutation.isPending || setDefaultMutation.isPending;

  const openDialog = (target: SignatureDialogTarget) => {
    setDialog(target);
    setDialogInstance((n) => n + 1);
    setDialogOpen(true);
  };

  const handleSave = async (input: SignatureSaveInput): Promise<SignatureSaveResult> => {
    if (!dialog) return { ok: false };
    try {
      const saved =
        dialog.kind === 'edit'
          ? await updateMutation.mutateAsync({
              id: dialog.signature.id,
              name: input.name,
              html: input.html,
            })
          : await createMutation.mutateAsync({ scope: dialog.scope, ...input });
      toast({ title: 'Signature saved', description: saved.name });
      refresh();
      return { ok: true };
    } catch (error) {
      if (errorCode(error) === 'CONFLICT') return { ok: false, nameError: errorText(error) };
      toast({
        title: 'Could not save the signature',
        description: errorText(error),
        variant: 'destructive',
      });
      return { ok: false };
    }
  };

  const setDefault = async (signature: EmailSignatureDto) => {
    try {
      await setDefaultMutation.mutateAsync({ id: signature.id });
      setAnnouncement(
        signature.scope === 'ORG'
          ? `${signature.name} is now the organisation's default signature.`
          : `${signature.name} is now your default signature.`
      );
      setFocusTarget(TITLE_IDS[signature.scope]);
      refresh();
    } catch (error) {
      toast({
        title: 'Could not change the default',
        description: errorText(error),
        variant: 'destructive',
      });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const deletedName = pendingDelete.name;
    try {
      await deleteMutation.mutateAsync({ id: pendingDelete.id });
      deletedScopeRef.current = pendingDelete.scope;
      setAnnouncement(`${deletedName} deleted.`);
      refresh();
    } catch (error) {
      toast({
        title: 'Could not delete the signature',
        description: errorText(error),
        variant: 'destructive',
      });
    }
  };

  const existingForDialog = (() => {
    if (!dialog) return [];
    const scope = dialog.kind === 'edit' ? dialog.signature.scope : dialog.scope;
    return scope === 'ORG' ? org : mine;
  })();

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6">
        <PageHeader
          breadcrumbs={BREADCRUMBS}
          title="Signatures"
          description="Added when you write a new email. Replies and forwards start without one."
          className="mb-6"
        />

        <output aria-live="polite" className="sr-only">
          {announcement}
        </output>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          <section aria-labelledby={TITLE_IDS.USER} className="lg:col-span-6">
            <Card className="h-full p-4 sm:p-5">
              <SectionHeader
                icon="person"
                iconBg="bg-sky-100 dark:bg-sky-900/30"
                iconFg="text-sky-700 dark:text-sky-300"
                title="My signatures"
                titleId={TITLE_IDS.USER}
                focusableTitle
                headingLevel={2}
                description="Only you can use these. Your default comes first."
                action={
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => openDialog({ kind: 'create', scope: 'USER' })}
                  >
                    New Signature
                  </Button>
                }
              />
              <SignatureList
                scope="USER"
                signatures={mine}
                canManage
                busy={busy}
                onEdit={(signature) => openDialog({ kind: 'edit', signature })}
                onDelete={setPendingDelete}
                onSetDefault={(s) => void setDefault(s)}
              />
            </Card>
          </section>

          <section aria-labelledby={TITLE_IDS.ORG} className="lg:col-span-6">
            <Card className="h-full p-4 sm:p-5">
              <SectionHeader
                icon="domain"
                iconBg="bg-indigo-100 dark:bg-indigo-900/30"
                iconFg="text-indigo-700 dark:text-indigo-300"
                title="Organisation signatures"
                titleId={TITLE_IDS.ORG}
                focusableTitle
                headingLevel={2}
                description="Shared with everyone. Used when someone has no default of their own."
                action={
                  canManageOrg ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => openDialog({ kind: 'create', scope: 'ORG' })}
                    >
                      New Organisation Signature
                    </Button>
                  ) : undefined
                }
              />
              {!canManageOrg && (
                <p className="mb-3 text-xs text-muted-foreground">
                  Only administrators and managers can change these.
                </p>
              )}
              <SignatureList
                scope="ORG"
                signatures={org}
                canManage={canManageOrg}
                busy={busy}
                onEdit={(signature) => openDialog({ kind: 'edit', signature })}
                onDelete={setPendingDelete}
                onSetDefault={(s) => void setDefault(s)}
              />
            </Card>
          </section>
        </div>

        {dialog && (
          <SignatureDialog
            key={dialogInstance}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            target={dialog}
            existing={existingForDialog}
            onSave={handleSave}
          />
        )}

        <ConfirmationDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
          title={`Delete ${pendingDelete?.name ?? 'this signature'}?`}
          description="It is removed for good. Emails already sent are not changed."
          confirmLabel="Delete Signature"
          variant="destructive"
          onConfirm={confirmDelete}
          isLoading={deleteMutation.isPending}
          onCloseAutoFocus={(event) => {
            const scope = deletedScopeRef.current;
            if (!scope) return;
            deletedScopeRef.current = null;
            event.preventDefault();
            setFocusTarget(TITLE_IDS[scope]);
          }}
        />
      </div>
    </div>
  );
}
