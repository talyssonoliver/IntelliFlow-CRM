'use client';

/**
 * Pipeline Settings Page
 *
 * IFC-063: FLOW-007 Pipeline Stage Customization
 *
 * Allows users to customize pipeline stages:
 * - Display name customization
 * - Color selection for Kanban columns
 * - Stage order via drag-and-drop
 * - Default probability per stage
 * - Enable/disable stages
 *
 * Target: <100ms save operations
 */

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Card, Button } from '@intelliflow/ui';
import { OPPORTUNITY_STAGES } from '@intelliflow/domain';

// Default colors for pipeline stages (from brand design system)
const DEFAULT_STAGE_COLORS: Record<string, string> = {
  PROSPECTING: '#6366f1',
  QUALIFICATION: '#8b5cf6',
  NEEDS_ANALYSIS: '#a855f7',
  PROPOSAL: '#d946ef',
  NEGOTIATION: '#f97316',
  CLOSED_WON: '#22c55e',
  CLOSED_LOST: '#ef4444',
};

// Default probabilities per stage
const DEFAULT_STAGE_PROBABILITIES: Record<string, number> = {
  PROSPECTING: 10,
  QUALIFICATION: 25,
  NEEDS_ANALYSIS: 40,
  PROPOSAL: 60,
  NEGOTIATION: 80,
  CLOSED_WON: 100,
  CLOSED_LOST: 0,
};

// Default display names
const DEFAULT_STAGE_NAMES: Record<string, string> = {
  PROSPECTING: 'Prospecting',
  QUALIFICATION: 'Qualification',
  NEEDS_ANALYSIS: 'Needs Analysis',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
};

// Predefined color palette for selection
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

interface StageConfig {
  id: string;
  stageKey: string;
  displayName: string;
  color: string;
  order: number;
  probability: number;
  isActive: boolean;
}

function getDefaultStages(): StageConfig[] {
  return OPPORTUNITY_STAGES.map((stageKey, index) => ({
    id: `default-${stageKey}`,
    stageKey,
    displayName: DEFAULT_STAGE_NAMES[stageKey],
    color: DEFAULT_STAGE_COLORS[stageKey],
    order: index,
    probability: DEFAULT_STAGE_PROBABILITIES[stageKey],
    isActive: true,
  }));
}

export default function PipelineSettingsPage() {
  const [stages, setStages] = useState<StageConfig[]>(getDefaultStages);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingStage, setEditingStage] = useState<string | null>(null);

  // Track changes
  useEffect(() => {
    const defaultStages = getDefaultStages();
    const changed = stages.some((stage) => {
      const def = defaultStages.find((d) => d.stageKey === stage.stageKey);
      return (
        def &&
        (stage.displayName !== def.displayName ||
          stage.color !== def.color ||
          stage.order !== def.order ||
          stage.probability !== def.probability ||
          stage.isActive !== def.isActive)
      );
    });
    setHasChanges(changed);
  }, [stages]);

  const handleUpdateStage = useCallback((stageKey: string, updates: Partial<StageConfig>) => {
    setStages((prev) =>
      prev.map((stage) =>
        stage.stageKey === stageKey ? { ...stage, ...updates } : stage
      )
    );
  }, []);

  const handleSave = async () => {
    setSaving(true);
    // In production, this would call the tRPC API
    // await trpc.pipelineConfig.updateAll.mutate({ stages })
    await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate API call
    setSaving(false);
    setHasChanges(false);
  };

  const handleReset = () => {
    setStages(getDefaultStages());
    setHasChanges(false);
  };

  const moveStage = (stageKey: string, direction: 'up' | 'down') => {
    setStages((prev) => {
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
  };

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
                disabled={!hasChanges || saving}
              >
                Reset
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges || saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>

        {/* Stage List */}
        <Card className="p-6">
          <div className="space-y-4">
            {stages.map((stage, index) => (
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
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveStage(stage.stageKey, 'down')}
                      disabled={index === stages.length - 1}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Move down"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Color Indicator */}
                  <div
                    className="w-4 h-full min-h-[60px] rounded"
                    style={{ backgroundColor: stage.color }}
                  />

                  {/* Stage Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        value={stage.displayName}
                        onChange={(e) =>
                          handleUpdateStage(stage.stageKey, { displayName: e.target.value })
                        }
                        onFocus={() => setEditingStage(stage.stageKey)}
                        onBlur={() => setEditingStage(null)}
                        className="font-medium text-foreground bg-transparent border-none focus:ring-1 focus:ring-primary rounded px-2 py-1"
                      />
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {stage.stageKey}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      {/* Probability */}
                      <div className="flex items-center gap-2">
                        <label className="text-muted-foreground">Probability:</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={stage.probability}
                          onChange={(e) =>
                            handleUpdateStage(stage.stageKey, {
                              probability: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)),
                            })
                          }
                          className="w-16 text-foreground bg-muted border border-border rounded px-2 py-1 text-center"
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>

                      {/* Active Toggle */}
                      <div className="flex items-center gap-2">
                        <label className="text-muted-foreground">Active:</label>
                        <button
                          onClick={() =>
                            handleUpdateStage(stage.stageKey, { isActive: !stage.isActive })
                          }
                          className={`relative w-10 h-5 rounded-full transition-colors ${
                            stage.isActive ? 'bg-primary' : 'bg-muted'
                          }`}
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
                  <div className="flex flex-wrap gap-1 max-w-[140px]">
                    {COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        onClick={() => handleUpdateStage(stage.stageKey, { color })}
                        className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${
                          stage.color === color ? 'ring-2 ring-offset-2 ring-primary' : ''
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
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
          </ul>
        </div>
      </div>
    </div>
  );
}
