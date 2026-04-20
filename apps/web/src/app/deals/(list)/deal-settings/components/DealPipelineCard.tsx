'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button, EmptyState, Input, Switch, toast } from '@intelliflow/ui';

interface PipelineStageRow {
  stageKey: string;
  displayName: string;
  color: string;
  order: number;
  probability: number;
  isActive: boolean;
}

export function DealPipelineCard() {
  const utils = trpc.useUtils();
  const stagesQuery = trpc.dealSettings.pipeline.getAll.useQuery();
  const updateStageMutation = trpc.dealSettings.pipeline.updateStage.useMutation({
    onSuccess: () => utils.dealSettings.pipeline.getAll.invalidate(),
    onError: (err) =>
      toast({
        title: 'Could not update stage',
        description: err.message,
        variant: 'destructive',
      }),
  });
  const resetMutation = trpc.dealSettings.pipeline.resetToDefaults.useMutation({
    onSuccess: () => {
      utils.dealSettings.pipeline.getAll.invalidate();
      toast({ title: 'Pipeline reset', description: 'Stages restored to defaults.' });
    },
  });

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#6366f1');
  const [editProbability, setEditProbability] = useState(0);

  if (stagesQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading pipeline stages…</div>;
  }
  if (stagesQuery.error) {
    return (
      <div className="text-sm text-destructive">
        Failed to load pipeline: {stagesQuery.error.message}
      </div>
    );
  }

  // pipelineConfig.getAll returns { stages: [...] }
  const raw = stagesQuery.data as unknown as
    | { stages?: PipelineStageRow[] }
    | PipelineStageRow[]
    | null;
  const stages: PipelineStageRow[] = Array.isArray(raw)
    ? raw
    : (() => {
        const nested = (raw as { stages?: PipelineStageRow[] })?.stages;
        return Array.isArray(nested) ? (nested as PipelineStageRow[]) : [];
      })();

  if (stages.length === 0) {
    return (
      <EmptyState
        entity="rules"
        size="sm"
        phase="passive"
        title="No pipeline stages"
        description="Reset to defaults to populate the stage list."
      />
    );
  }

  const startEdit = (stage: PipelineStageRow) => {
    setEditingKey(stage.stageKey);
    setEditName(stage.displayName);
    setEditColor(stage.color);
    setEditProbability(stage.probability);
  };

  const cancelEdit = () => setEditingKey(null);

  const saveEdit = async (stageKey: string) => {
    await updateStageMutation.mutateAsync({
      stage: stageKey as any,
      displayName: editName,
      color: editColor,
      probability: editProbability,
    });
    setEditingKey(null);
  };

  const toggleActive = (stage: PipelineStageRow) => {
    updateStageMutation.mutate({
      stage: stage.stageKey as any,
      isActive: !stage.isActive,
    });
  };

  const isBusy = updateStageMutation.isPending || resetMutation.isPending;

  return (
    <div className="space-y-3">
      <div className="divide-y divide-border rounded-md border border-border">
        {stages
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((stage) => {
            const isEditing = editingKey === stage.stageKey;
            return (
              <div
                key={stage.stageKey}
                className="px-4 py-3"
                data-testid={`deal-stage-${stage.stageKey}`}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="max-w-[200px] h-8 text-sm"
                        aria-label="Stage name"
                      />
                      <input
                        type="color"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="h-8 w-8 rounded cursor-pointer border border-border"
                        aria-label="Stage color"
                      />
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={editProbability}
                        onChange={(e) =>
                          setEditProbability(
                            Math.min(100, Math.max(0, Number.parseInt(e.target.value || '0', 10)))
                          )
                        }
                        className="max-w-[80px] h-8 text-sm"
                        aria-label="Probability"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => saveEdit(stage.stageKey)}
                        disabled={isBusy || editName.trim().length === 0}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {stage.displayName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stage.probability}% probability
                      </div>
                    </div>
                    <Switch
                      checked={stage.isActive}
                      onCheckedChange={() => toggleActive(stage)}
                      disabled={isBusy}
                      aria-label={`Toggle ${stage.displayName} active`}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(stage)}
                      disabled={isBusy}
                    >
                      Edit
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => resetMutation.mutate()}
          disabled={isBusy}
        >
          {resetMutation.isPending ? 'Resetting…' : 'Reset pipeline'}
        </Button>
      </div>
    </div>
  );
}
