'use client';

/**
 * Pipeline Settings Content (Client Component)
 *
 * IFC-063: FLOW-007 Pipeline Stage Customization
 *
 * Allows users to customize pipeline stages:
 * - Display name customization
 * - Color selection for Kanban columns
 * - Stage order via up/down buttons
 * - Default probability per stage
 * - Enable/disable stages (except protected terminal stages)
 *
 * Target: <100ms save operations
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, Button, Skeleton } from '@intelliflow/ui';
import { usePipelineConfig, type PipelineStage } from '@/hooks/usePipelineConfig';

// Predefined color palette for selection (brand-aligned)
const COLOR_PALETTE = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#a855f7', // Purple
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#64748b', // Slate
];

// Protected stages that cannot be deactivated
const PROTECTED_STAGES = ['CLOSED_WON', 'CLOSED_LOST'];

export default function PipelineSettingsContent() {
  const {
    stages: apiStages,
    isLoading,
    error,
    updateAll,
    resetToDefaults,
    isSaving,
    isResetting,
  } = usePipelineConfig();

  // Local state for editing (optimistic updates)
  const [localStages, setLocalStages] = useState<PipelineStage[]>([]);
  const [editingStage, setEditingStage] = useState<string | null>(null);

  // Sync local state with API data
  useEffect(() => {
    if (apiStages.length > 0) {
      setLocalStages(apiStages);
    }
  }, [apiStages]);

  // Track if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (localStages.length !== apiStages.length) return true;
    return localStages.some((local, index) => {
      const api = apiStages[index];
      if (!api) return true;
      return (
        local.displayName !== api.displayName ||
        local.color !== api.color ||
        local.order !== api.order ||
        local.probability !== api.probability ||
        local.isActive !== api.isActive
      );
    });
  }, [localStages, apiStages]);

  // Update local stage
  const handleUpdateStage = useCallback(
    (stageKey: string, updates: Partial<PipelineStage>) => {
      setLocalStages((prev) =>
        prev.map((stage) =>
          stage.stageKey === stageKey ? { ...stage, ...updates } : stage
        )
      );
    },
    []
  );

  // Save all changes
  const handleSave = useCallback(() => {
    updateAll({
      stages: localStages.map((s, index) => ({
        stage: s.stageKey as Parameters<typeof updateAll>[0]['stages'][number]['stage'],
        displayName: s.displayName,
        color: s.color,
        sortOrder: index,
        probability: s.probability,
        isActive: s.isActive,
      })),
    });
  }, [localStages, updateAll]);

  // Reset to defaults
  const handleReset = useCallback(() => {
    if (window.confirm('Reset all pipeline settings to defaults? This cannot be undone.')) {
      resetToDefaults();
    }
  }, [resetToDefaults]);

  // Move stage up or down
  const moveStage = useCallback((stageKey: string, direction: 'up' | 'down') => {
    setLocalStages((prev) => {
      const index = prev.findIndex((s) => s.stageKey === stageKey);
      if (
        (direction === 'up' && index === 0) ||
        (direction === 'down' && index === prev.length - 1)
      ) {
        return prev;
      }
      const newStages = [...prev];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      [newStages[index], newStages[swapIndex]] = [newStages[swapIndex], newStages[index]];
      return newStages.map((s, i) => ({ ...s, order: i }));
    });
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="settings_pipeline_page">
        <div className="max-w-3xl">
          <div className="mb-8">
            <Skeleton className="h-4 w-24 mb-4" />
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Card className="p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="settings_pipeline_page">
        <div className="max-w-3xl">
          <Card className="p-6 border-destructive">
            <p className="text-destructive">
              Failed to load pipeline settings: {error.message}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="settings_pipeline_page">
      <div className="max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Link href="/settings" className="hover:text-primary">
              Settings
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Pipeline</span>
          </nav>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Pipeline Stages</h1>
              <p className="text-muted-foreground mt-1">
                Customize your deal pipeline stages, colors, and order
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={isSaving || isResetting}
              >
                {isResetting ? 'Resetting...' : 'Reset'}
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>

        {/* Stage List */}
        <Card className="p-6">
          <div className="space-y-4">
            {localStages.map((stage, index) => {
              const isProtected = PROTECTED_STAGES.includes(stage.stageKey);
              return (
                <div
                  key={stage.stageKey}
                  className={`p-4 rounded-lg border transition-colors ${
                    editingStage === stage.stageKey
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Order Controls */}
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => moveStage(stage.stageKey, 'up')}
                        disabled={index === 0}
                        className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Move up"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 15l7-7 7 7"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => moveStage(stage.stageKey, 'down')}
                        disabled={index === localStages.length - 1}
                        className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Move down"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                    </div>

                    {/* Color Indicator */}
                    <div
                      className="w-4 h-full min-h-[60px] rounded"
                      style={{ backgroundColor: stage.color }}
                      aria-hidden="true"
                    />

                    {/* Stage Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          value={stage.displayName}
                          onChange={(e) =>
                            handleUpdateStage(stage.stageKey, {
                              displayName: e.target.value,
                            })
                          }
                          onFocus={() => setEditingStage(stage.stageKey)}
                          onBlur={() => setEditingStage(null)}
                          className="font-medium text-foreground bg-transparent border-none focus:ring-1 focus:ring-primary rounded px-2 py-1"
                          aria-label={`Display name for ${stage.stageKey}`}
                        />
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          {stage.stageKey}
                        </span>
                        {isProtected && (
                          <span className="text-xs text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded">
                            Protected
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        {/* Probability */}
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`probability-${stage.stageKey}`}
                            className="text-muted-foreground"
                          >
                            Probability:
                          </label>
                          <input
                            id={`probability-${stage.stageKey}`}
                            type="number"
                            min="0"
                            max="100"
                            value={stage.probability}
                            onChange={(e) =>
                              handleUpdateStage(stage.stageKey, {
                                probability: Math.min(
                                  100,
                                  Math.max(0, parseInt(e.target.value) || 0)
                                ),
                              })
                            }
                            className="w-16 text-foreground bg-muted border border-border rounded px-2 py-1 text-center"
                            aria-describedby={`probability-help-${stage.stageKey}`}
                          />
                          <span className="text-muted-foreground">%</span>
                        </div>

                        {/* Active Toggle */}
                        <div className="flex items-center gap-2">
                          <label className="text-muted-foreground">Active:</label>
                          <button
                            onClick={() => {
                              if (isProtected && stage.isActive) {
                                // Cannot deactivate protected stages
                                return;
                              }
                              handleUpdateStage(stage.stageKey, {
                                isActive: !stage.isActive,
                              });
                            }}
                            disabled={isProtected && stage.isActive}
                            className={`relative w-10 h-5 rounded-full transition-colors ${
                              stage.isActive ? 'bg-primary' : 'bg-muted'
                            } ${isProtected && stage.isActive ? 'cursor-not-allowed opacity-60' : ''}`}
                            role="switch"
                            aria-checked={stage.isActive}
                            aria-label={`${stage.isActive ? 'Deactivate' : 'Activate'} ${stage.displayName} stage`}
                            title={
                              isProtected && stage.isActive
                                ? 'Terminal stages cannot be deactivated'
                                : undefined
                            }
                          >
                            <span
                              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                                stage.isActive ? 'left-5' : 'left-0.5'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Color Picker */}
                    <div
                      className="flex flex-wrap gap-1 max-w-[140px]"
                      role="group"
                      aria-label={`Color selection for ${stage.displayName}`}
                    >
                      {COLOR_PALETTE.map((color) => (
                        <button
                          key={color}
                          onClick={() => handleUpdateStage(stage.stageKey, { color })}
                          className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${
                            stage.color === color
                              ? 'ring-2 ring-offset-2 ring-primary'
                              : ''
                          }`}
                          style={{ backgroundColor: color }}
                          aria-label={`Select color ${color}`}
                          aria-pressed={stage.color === color}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Help Text */}
        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <h3 className="font-medium text-foreground mb-2">Tips</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>Use the arrow buttons to reorder stages in your pipeline</li>
            <li>Colors help identify stages in the Kanban view</li>
            <li>Default probability is auto-assigned when deals enter a stage</li>
            <li>Inactive stages are hidden from the pipeline view</li>
            <li>
              <strong>Protected stages</strong> (Closed Won, Closed Lost) cannot be
              deactivated
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
