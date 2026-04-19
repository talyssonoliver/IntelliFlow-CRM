'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { Button, ConfirmationDialog, toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { DocumentSettingsLoading } from './DocumentSettingsLoading';
import { FileTypesSection, type FileTypesValue } from './components/FileTypesSection';
import { SizeLimitsSection, type SizeLimitsValue } from './components/SizeLimitsSection';
import { AntivirusSection, type AntivirusValue } from './components/AntivirusSection';
import {
  RetentionPolicySection,
  type RetentionPolicyValue,
} from './components/RetentionPolicySection';
import { AutomationSection, type AutomationValue } from './components/AutomationSection';

const DEFAULT_AUTOMATION: AutomationValue = {
  normalizeFilename: true,
  preventDeleteIfReferenced: true,
  notifyOnOwnerChange: false,
  notifyOnUpload: false,
  aiDocumentClassification: false,
  aiSensitiveDataDetection: false,
  aiSummarization: false,
};

export default function DocumentSettingsContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  const fileTypesQuery = trpc.documentSettings.fileTypes.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const sizeLimitsQuery = trpc.documentSettings.sizeLimits.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const antivirusQuery = trpc.documentSettings.antivirus.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const retentionQuery = trpc.documentSettings.retention.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const automationQuery = trpc.documentSettings.automation.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const [fileTypes, setFileTypes] = useState<FileTypesValue>({
    allowedExtensions: [],
    blockedExtensions: [],
    allowedMimeTypes: [],
  });
  const [sizeLimits, setSizeLimits] = useState<SizeLimitsValue>({
    maxFileSizeMB: 100,
    maxTotalStorageMB: 10240,
    maxFilesPerUpload: 20,
  });
  const [antivirus, setAntivirus] = useState<AntivirusValue>({
    enableAntivirusScan: true,
    quarantineInfected: true,
    notifyAdminOnThreat: true,
  });
  const [retention, setRetention] = useState<RetentionPolicyValue>({
    retentionDays: 365,
    archiveInsteadOfDelete: true,
    preserveVersions: 5,
    isActive: false,
  });
  const [automation, setAutomation] = useState<AutomationValue>(DEFAULT_AUTOMATION);
  const [isDirty, setIsDirty] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    if (fileTypesQuery.data) {
      setFileTypes({
        allowedExtensions: fileTypesQuery.data.allowedExtensions,
        blockedExtensions: fileTypesQuery.data.blockedExtensions,
        allowedMimeTypes: fileTypesQuery.data.allowedMimeTypes,
      });
    }
  }, [fileTypesQuery.data]);

  useEffect(() => {
    if (sizeLimitsQuery.data) {
      setSizeLimits({
        maxFileSizeMB: sizeLimitsQuery.data.maxFileSizeMB,
        maxTotalStorageMB: sizeLimitsQuery.data.maxTotalStorageMB,
        maxFilesPerUpload: sizeLimitsQuery.data.maxFilesPerUpload,
      });
    }
  }, [sizeLimitsQuery.data]);

  useEffect(() => {
    if (antivirusQuery.data) {
      setAntivirus({
        enableAntivirusScan: antivirusQuery.data.enableAntivirusScan,
        quarantineInfected: antivirusQuery.data.quarantineInfected,
        notifyAdminOnThreat: antivirusQuery.data.notifyAdminOnThreat,
      });
    }
  }, [antivirusQuery.data]);

  useEffect(() => {
    if (retentionQuery.data) {
      setRetention({
        retentionDays: retentionQuery.data.retentionDays,
        archiveInsteadOfDelete: retentionQuery.data.archiveInsteadOfDelete,
        preserveVersions: retentionQuery.data.preserveVersions,
        isActive: retentionQuery.data.isActive,
      });
    }
  }, [retentionQuery.data]);

  useEffect(() => {
    if (automationQuery.data) {
      setAutomation({
        normalizeFilename: automationQuery.data.normalizeFilename,
        preventDeleteIfReferenced: automationQuery.data.preventDeleteIfReferenced,
        notifyOnOwnerChange: automationQuery.data.notifyOnOwnerChange,
        notifyOnUpload: automationQuery.data.notifyOnUpload,
        aiDocumentClassification: automationQuery.data.aiDocumentClassification,
        aiSensitiveDataDetection: automationQuery.data.aiSensitiveDataDetection,
        aiSummarization: automationQuery.data.aiSummarization,
      });
    }
  }, [automationQuery.data]);

  const fileTypesMutation = trpc.documentSettings.fileTypes.update.useMutation();
  const sizeLimitsMutation = trpc.documentSettings.sizeLimits.update.useMutation();
  const antivirusMutation = trpc.documentSettings.antivirus.update.useMutation();
  const retentionMutation = trpc.documentSettings.retention.update.useMutation();
  const automationMutation = trpc.documentSettings.automation.update.useMutation();

  const fileTypesReset = trpc.documentSettings.fileTypes.resetToDefaults.useMutation();
  const sizeLimitsReset = trpc.documentSettings.sizeLimits.resetToDefaults.useMutation();
  const antivirusReset = trpc.documentSettings.antivirus.resetToDefaults.useMutation();
  const retentionReset = trpc.documentSettings.retention.resetToDefaults.useMutation();
  const automationReset = trpc.documentSettings.automation.resetToDefaults.useMutation();

  const utils = trpc.useUtils();

  const isSaving =
    fileTypesMutation.isPending ||
    sizeLimitsMutation.isPending ||
    antivirusMutation.isPending ||
    retentionMutation.isPending ||
    automationMutation.isPending;

  const handleSave = useCallback(async () => {
    try {
      await Promise.all([
        fileTypesMutation.mutateAsync(fileTypes),
        sizeLimitsMutation.mutateAsync(sizeLimits),
        antivirusMutation.mutateAsync(antivirus),
        retentionMutation.mutateAsync(retention),
        automationMutation.mutateAsync(automation),
      ]);
      await Promise.all([
        utils.documentSettings.fileTypes.get.invalidate(),
        utils.documentSettings.sizeLimits.get.invalidate(),
        utils.documentSettings.antivirus.get.invalidate(),
        utils.documentSettings.retention.get.invalidate(),
        utils.documentSettings.automation.get.invalidate(),
      ]);
      setIsDirty(false);
      toast.success('Document settings saved');
    } catch {
      toast.error('Failed to save document settings');
    }
  }, [
    fileTypesMutation,
    sizeLimitsMutation,
    antivirusMutation,
    retentionMutation,
    automationMutation,
    fileTypes,
    sizeLimits,
    antivirus,
    retention,
    automation,
    utils,
  ]);

  const handleReset = useCallback(async () => {
    try {
      await Promise.all([
        fileTypesReset.mutateAsync(),
        sizeLimitsReset.mutateAsync(),
        antivirusReset.mutateAsync(),
        retentionReset.mutateAsync(),
        automationReset.mutateAsync(),
      ]);
      await Promise.all([
        utils.documentSettings.fileTypes.get.invalidate(),
        utils.documentSettings.sizeLimits.get.invalidate(),
        utils.documentSettings.antivirus.get.invalidate(),
        utils.documentSettings.retention.get.invalidate(),
        utils.documentSettings.automation.get.invalidate(),
      ]);
      setIsDirty(false);
      setResetOpen(false);
      toast.success('Reset to factory defaults');
    } catch {
      toast.error('Failed to reset');
    }
  }, [fileTypesReset, sizeLimitsReset, antivirusReset, retentionReset, automationReset, utils]);

  if (authLoading || !isAuthenticated) {
    return <DocumentSettingsLoading />;
  }

  const isLoading =
    fileTypesQuery.isLoading ||
    sizeLimitsQuery.isLoading ||
    antivirusQuery.isLoading ||
    retentionQuery.isLoading ||
    automationQuery.isLoading;

  if (isLoading) {
    return <DocumentSettingsLoading />;
  }

  const hasError =
    fileTypesQuery.error ||
    sizeLimitsQuery.error ||
    antivirusQuery.error ||
    retentionQuery.error ||
    automationQuery.error;

  if (hasError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
          <span className="material-symbols-outlined text-3xl text-destructive" aria-hidden="true">
            error
          </span>
          <p className="mt-2 font-medium">Failed to load document settings</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              void fileTypesQuery.refetch();
              void sizeLimitsQuery.refetch();
              void antivirusQuery.refetch();
              void retentionQuery.refetch();
              void automationQuery.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[{ label: 'Documents', href: '/documents' }, { label: 'Document Settings' }]}
        title="Document Settings"
        description="Configure file types, size limits, antivirus scanning, retention, and automation."
        actions={[
          {
            id: 'reset',
            label: 'Reset to Defaults',
            variant: 'outline',
            onClick: () => setResetOpen(true),
            disabled: isSaving,
          },
          {
            id: 'save',
            label: 'Save Changes',
            variant: 'default',
            onClick: handleSave,
            disabled: !isDirty || isSaving,
            loading: isSaving,
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <FileTypesSection
          value={fileTypes}
          onChange={(next) => {
            setFileTypes(next);
            setIsDirty(true);
          }}
        />
        <AntivirusSection
          value={antivirus}
          onChange={(next) => {
            setAntivirus(next);
            setIsDirty(true);
          }}
        />
        <SizeLimitsSection
          value={sizeLimits}
          onChange={(next) => {
            setSizeLimits(next);
            setIsDirty(true);
          }}
        />
        <RetentionPolicySection
          value={retention}
          onChange={(next) => {
            setRetention(next);
            setIsDirty(true);
          }}
        />
        <AutomationSection
          value={automation}
          onChange={(next) => {
            setAutomation(next);
            setIsDirty(true);
          }}
        />
      </div>

      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset document settings?"
        description="All document settings will be reset to factory defaults. This cannot be undone."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        onConfirm={handleReset}
      />
    </div>
  );
}
