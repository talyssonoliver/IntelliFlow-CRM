'use client';

/**
 * AI Settings Content (Client Component)
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Main container with tabs for:
 * - Overview (Dashboard with active versions)
 * - Versions (Filterable table)
 * - Memory (Zep budget gauge)
 * - Audit (Audit log)
 *
 * Pattern: Follows PipelineSettingsContent structure
 */

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import {
  Card,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@intelliflow/ui';
import type { ChainType, ChainVersionStatus } from '@intelliflow/domain';
import type {
  ChainVersionSummary,
  CreateChainVersionInput,
  UpdateChainVersionInput,
} from '@intelliflow/validators';
import { useChainVersions, useVersionAudit } from './hooks';
import {
  ChainVersionsDashboard,
  ChainVersionsTable,
  ZepBudgetGauge,
  RollbackConfirmDialog,
  VersionAuditLog,
  ChainVersionEditor,
  VersionComparisonView,
} from './components';

type TabValue = 'overview' | 'versions' | 'compare' | 'memory' | 'audit';

export default function AISettingsContent() {
  const router = useRouter();

  // Require authentication - redirects to login if not authenticated
  const { isLoading: authLoading } = useRequireAuth();

  // State
  const [activeTab, setActiveTab] = useState<TabValue>('overview');
  const [selectedChainType, setSelectedChainType] = useState<ChainType | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<ChainVersionStatus | 'all'>('all');
  const [selectedVersion, setSelectedVersion] = useState<ChainVersionSummary | null>(null);

  // Dialogs
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [deprecateDialogOpen, setDeprecateDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<ChainVersionSummary | null>(null);
  const [actionVersion, setActionVersion] = useState<ChainVersionSummary | null>(null);

  // Hooks
  const {
    versions,
    activeVersions,
    isLoading,
    isLoadingActive,
    error,
    createVersion,
    updateVersion,
    activateVersion,
    deprecateVersion,
    archiveVersion,
    rollbackVersion,
    compareVersions,
    isCreating,
    isUpdating,
    isActivating,
    isDeprecating,
    isArchiving,
    isRollingBack,
    refetch,
  } = useChainVersions({
    chainType: selectedChainType,
    status: selectedStatus,
  });

  const { auditLog, isLoading: isLoadingAudit } = useVersionAudit({
    versionId: selectedVersion?.id,
  });

  // Handlers
  const handleVersionSelect = useCallback((version: ChainVersionSummary) => {
    setSelectedVersion(version);
  }, []);

  const handleActivateClick = useCallback(
    (versionId: string) => {
      const version = versions?.find((v) => v.id === versionId);
      if (version) {
        setActionVersion(version);
        setActivateDialogOpen(true);
      }
    },
    [versions]
  );

  const handleDeprecateClick = useCallback(
    (versionId: string) => {
      const version = versions?.find((v) => v.id === versionId);
      if (version) {
        setActionVersion(version);
        setDeprecateDialogOpen(true);
      }
    },
    [versions]
  );

  const handleArchiveClick = useCallback(
    (versionId: string) => {
      const version = versions?.find((v) => v.id === versionId);
      if (version) {
        setActionVersion(version);
        setArchiveDialogOpen(true);
      }
    },
    [versions]
  );

  const handleRollbackClick = useCallback(
    (versionId: string) => {
      const version = versions?.find((v) => v.id === versionId);
      if (version) {
        setActionVersion(version);
        setRollbackDialogOpen(true);
      }
    },
    [versions]
  );

  const handleActivateConfirm = useCallback(async () => {
    if (!actionVersion) return;
    await activateVersion(actionVersion.id);
    setActivateDialogOpen(false);
    setActionVersion(null);
  }, [actionVersion, activateVersion]);

  const handleDeprecateConfirm = useCallback(async () => {
    if (!actionVersion) return;
    await deprecateVersion(actionVersion.id);
    setDeprecateDialogOpen(false);
    setActionVersion(null);
  }, [actionVersion, deprecateVersion]);

  const handleArchiveConfirm = useCallback(async () => {
    if (!actionVersion) return;
    await archiveVersion(actionVersion.id);
    setArchiveDialogOpen(false);
    setActionVersion(null);
  }, [actionVersion, archiveVersion]);

  const handleRollbackConfirm = useCallback(
    async (reason: string) => {
      if (!actionVersion) return;
      await rollbackVersion(actionVersion.id, reason);
      setRollbackDialogOpen(false);
      setActionVersion(null);
    },
    [actionVersion, rollbackVersion]
  );

  const handleCreateVersion = useCallback(
    async (input: CreateChainVersionInput) => {
      await createVersion(input);
    },
    [createVersion]
  );

  const handleUpdateVersion = useCallback(
    async (id: string, input: UpdateChainVersionInput) => {
      await updateVersion(id, input);
    },
    [updateVersion]
  );

  // Check for auth errors
  const isAuthError =
    error?.message?.toLowerCase().includes('authentication') ||
    error?.message?.toLowerCase().includes('unauthorized');

  // Redirect to login for auth errors
  useEffect(() => {
    if (error && isAuthError && !isLoading && !authLoading) {
      router.replace('/login');
    }
  }, [error, isAuthError, isLoading, authLoading, router]);

  // Auth error - show redirecting state
  if (error && isAuthError) {
    return (
      <div className="settings_ai_page">
        <div className="max-w-5xl">
          <Card className="p-6 flex items-center gap-3">
            <span className="material-symbols-outlined text-slate-400 animate-spin">
              progress_activity
            </span>
            <p className="text-muted-foreground">Redirecting to login...</p>
          </Card>
        </div>
      </div>
    );
  }

  // Non-auth error state
  if (error && !isAuthError) {
    return (
      <div className="settings_ai_page">
        <div className="max-w-5xl">
          <Card className="p-6 border-destructive">
            <p className="text-destructive">Failed to load AI settings: {error.message}</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="settings_ai_page">
      <div className="max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Link href="/agent-approvals" className="hover:text-primary">
              AI & Agents
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">AI Chains</span>
          </nav>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">AI Chain Versions</h1>
              <p className="text-muted-foreground mt-1">
                Manage AI chain versions, rollout strategies, and memory budget
              </p>
            </div>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Refresh
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
            <TabsTrigger value="memory">Memory</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-4">Active Versions</h2>
              <ChainVersionsDashboard
                activeVersions={activeVersions}
                isLoading={isLoadingActive}
                onViewVersion={(id) => {
                  const version = versions?.find((v) => v.id === id);
                  if (version) {
                    setSelectedVersion(version);
                    setActiveTab('versions');
                  }
                }}
              />
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Total Versions</p>
                <p className="text-2xl font-bold">{versions?.length ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-600">
                  {Object.values(activeVersions).filter(Boolean).length}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Drafts</p>
                <p className="text-2xl font-bold text-gray-600">
                  {versions?.filter((v) => v.status === 'DRAFT').length ?? 0}
                </p>
              </Card>
            </div>
          </TabsContent>

          {/* Versions Tab */}
          <TabsContent value="versions">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">All Versions</h2>
              <Button
                onClick={() => {
                  setEditingVersion(null);
                  setEditorOpen(true);
                }}
                size="sm"
              >
                Create Version
              </Button>
            </div>
            <ChainVersionsTable
              versions={versions ?? []}
              isLoading={isLoading}
              onSelect={handleVersionSelect}
              onActivate={handleActivateClick}
              onDeprecate={handleDeprecateClick}
              onArchive={handleArchiveClick}
              onRollback={handleRollbackClick}
              selectedChainType={selectedChainType}
              selectedStatus={selectedStatus}
              onChainTypeChange={setSelectedChainType}
              onStatusChange={setSelectedStatus}
              isActioning={isActivating || isDeprecating || isArchiving || isRollingBack}
            />
          </TabsContent>

          {/* Compare Tab */}
          <TabsContent value="compare">
            <VersionComparisonView
              versions={versions ?? []}
              onCompare={compareVersions}
              isLoading={isLoading}
            />
          </TabsContent>

          {/* Memory Tab */}
          <TabsContent value="memory">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ZepBudgetGauge />
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Memory Management</h3>
                <div className="space-y-4 text-sm text-muted-foreground">
                  <p>
                    Zep Memory provides persistent conversation storage for AI chains. The free tier
                    includes 1,000 episodes per month.
                  </p>
                  <div className="space-y-2">
                    <p>
                      <strong>Thresholds:</strong>
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>
                        <span className="text-green-600">0-79%</span>: Normal operation
                      </li>
                      <li>
                        <span className="text-yellow-600">80-94%</span>: Warning - consider
                        upgrading
                      </li>
                      <li>
                        <span className="text-red-600">95-100%</span>: Critical - fallback to
                        in-memory
                      </li>
                    </ul>
                  </div>
                  <p>
                    When the limit is reached, conversations will use in-memory storage which does
                    not persist across sessions.
                  </p>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Audit Tab */}
          <TabsContent value="audit">
            <VersionAuditLog auditLog={auditLog} isLoading={isLoadingAudit} />
          </TabsContent>
        </Tabs>

        {/* Activate Dialog */}
        <Dialog open={activateDialogOpen} onOpenChange={setActivateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Activate Version?</DialogTitle>
              <DialogDescription>
                This will activate version{' '}
                <span className="font-mono">{actionVersion?.id.slice(0, 8)}...</span> and deprecate
                the current active version for {actionVersion?.chainType}.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActivateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleActivateConfirm} disabled={isActivating}>
                {isActivating ? 'Activating...' : 'Activate'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Deprecate Dialog */}
        <Dialog open={deprecateDialogOpen} onOpenChange={setDeprecateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deprecate Version?</DialogTitle>
              <DialogDescription>
                This will deprecate version{' '}
                <span className="font-mono">{actionVersion?.id.slice(0, 8)}...</span>. Deprecated
                versions can be rolled back or archived.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeprecateDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={handleDeprecateConfirm} disabled={isDeprecating}>
                {isDeprecating ? 'Deprecating...' : 'Deprecate'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Archive Dialog */}
        <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Archive Version?</DialogTitle>
              <DialogDescription>
                This will archive version{' '}
                <span className="font-mono">{actionVersion?.id.slice(0, 8)}...</span>. Archived
                versions are hidden by default but can still be rolled back.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setArchiveDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={handleArchiveConfirm} disabled={isArchiving}>
                {isArchiving ? 'Archiving...' : 'Archive'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rollback Dialog */}
        <RollbackConfirmDialog
          open={rollbackDialogOpen}
          onOpenChange={setRollbackDialogOpen}
          targetVersion={actionVersion}
          onConfirm={handleRollbackConfirm}
          isLoading={isRollingBack}
        />

        {/* Version Editor Dialog */}
        <ChainVersionEditor
          open={editorOpen}
          onOpenChange={(open) => {
            setEditorOpen(open);
            if (!open) setEditingVersion(null);
          }}
          existingDraft={editingVersion}
          onCreate={handleCreateVersion}
          onUpdate={handleUpdateVersion}
          isLoading={isCreating || isUpdating}
        />
      </div>
    </div>
  );
}
