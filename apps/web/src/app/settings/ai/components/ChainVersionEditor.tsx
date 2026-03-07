'use client';

/**
 * Chain Version Editor Component
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Modal dialog for creating new chain versions or editing existing drafts.
 * Features:
 * - Chain type selection (SCORING, QUALIFICATION, EMAIL_WRITER, FOLLOWUP)
 * - Model input
 * - System prompt textarea
 * - Temperature and max tokens configuration
 * - Validation for required fields
 * - Create and edit modes
 *
 * Acceptance Criteria: AC5 (create draft), AC6 (edit draft)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Textarea,
  Label,
} from '@intelliflow/ui';
import type { ChainType } from '@intelliflow/domain';
import type {
  ChainVersionSummary,
  CreateChainVersionInput,
  UpdateChainVersionInput,
} from '@intelliflow/validators';

const CHAIN_TYPES: { value: ChainType; label: string }[] = [
  { value: 'SCORING', label: 'Lead Scoring' },
  { value: 'QUALIFICATION', label: 'Lead Qualification' },
  { value: 'EMAIL_WRITER', label: 'Email Writer' },
  { value: 'FOLLOWUP', label: 'Follow-up' },
];

interface ChainVersionEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingDraft?: ChainVersionSummary | null;
  onCreate: (input: CreateChainVersionInput) => Promise<void>;
  onUpdate?: (id: string, input: UpdateChainVersionInput) => Promise<void>;
  isLoading: boolean;
}

export function ChainVersionEditor({
  open,
  onOpenChange,
  existingDraft = null,
  onCreate,
  onUpdate,
  isLoading,
}: Readonly<ChainVersionEditorProps>) {
  const isEditMode = !!existingDraft;

  // Form state
  const [chainType, setChainType] = useState<ChainType | ''>('');
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [temperature, setTemperature] = useState('0.7');
  const [maxTokens, setMaxTokens] = useState('2000');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Populate form when editing an existing draft
  useEffect(() => {
    if (existingDraft) {
      setChainType(existingDraft.chainType);
      setModel(existingDraft.model);
      setDescription(existingDraft.description ?? '');
      // Prompt and temperature/maxTokens are not in ChainVersionSummary,
      // so they'll need to be fetched separately or left blank for edit
      setPrompt('');
      setTemperature('0.7');
      setMaxTokens('2000');
    }
  }, [existingDraft]);

  // Reset form when dialog closes
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setChainType('');
        setModel('');
        setPrompt('');
        setTemperature('0.7');
        setMaxTokens('2000');
        setDescription('');
        setError(null);
      }
      onOpenChange(newOpen);
    },
    [onOpenChange]
  );

  // Validation
  const isPromptValid = prompt.length >= 10;
  const isModelValid = model.length > 0;
  const isChainTypeValid = chainType !== '';
  const canSubmit = isChainTypeValid && isModelValid && isPromptValid && !isLoading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      setError(null);

      if (isEditMode && onUpdate && existingDraft) {
        const updateInput: UpdateChainVersionInput = {
          model,
          description: description || undefined,
          prompt: prompt || undefined,
          temperature: Number.parseFloat(temperature),
          maxTokens: Number.parseInt(maxTokens, 10),
        };
        await onUpdate(existingDraft.id, updateInput);
      } else {
        const createInput: CreateChainVersionInput = {
          chainType: chainType,
          model,
          prompt,
          temperature: Number.parseFloat(temperature),
          maxTokens: Number.parseInt(maxTokens, 10),
          description: description || undefined,
          rolloutStrategy: 'IMMEDIATE',
        };
        await onCreate(createInput);
      }

      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Chain Version' : 'Create Chain Version'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update the draft chain version configuration.'
              : 'Create a new chain version as a draft. You can activate it later.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Chain Type */}
          <div className="space-y-2">
            <Label htmlFor="editor-chain-type">
              Chain Type{' '}<span className="text-destructive">*</span>
            </Label>
            <select
              id="editor-chain-type"
              aria-label="Chain Type"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={chainType}
              onChange={(e) => setChainType(e.target.value as ChainType)}
              disabled={isEditMode || isLoading}
            >
              <option value="">Select chain type...</option>
              {CHAIN_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor="editor-model">
              Model{' '}<span className="text-destructive">*</span>
            </Label>
            <Input
              id="editor-model"
              aria-label="Model"
              placeholder="e.g., gpt-4, gpt-4-turbo, gpt-3.5-turbo"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <Label htmlFor="editor-prompt">
              System Prompt{' '}<span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="editor-prompt"
              aria-label="System Prompt"
              placeholder="Enter the system prompt for this chain version..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[120px] font-mono text-sm"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Minimum 10 characters. This prompt defines how the AI chain behaves.
            </p>
          </div>

          {/* Temperature & Max Tokens */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="editor-temperature">Temperature</Label>
              <Input
                id="editor-temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editor-max-tokens">Max Tokens</Label>
              <Input
                id="editor-max-tokens"
                type="number"
                min="100"
                max="128000"
                step="100"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="editor-description">Description</Label>
            <Input
              id="editor-description"
              placeholder="Brief description of this version..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {(() => {
              if (isLoading) return 'Saving...';
              if (isEditMode) return 'Save Changes';
              return 'Create Draft';
            })()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
