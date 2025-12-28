'use client';

import { useMemo } from 'react';
import ContractTagBadge, { ContractTagType, ContractTagSummary } from './ContractTagBadge';

// Re-export ContractTagType for convenience
export type { ContractTagType } from './ContractTagBadge';

export interface ParsedTag {
  type: ContractTagType;
  value: string;
  raw: string;
}

export interface ContractTagListProps {
  /** Raw contract string (e.g., "FILE:path/to/file;ENV:VAR_NAME;POLICY:rule") */
  rawString: string;
  /** Column type for context-specific parsing */
  columnType?: 'prerequisites' | 'artifacts' | 'validation';
  /** Display mode */
  mode?: 'full' | 'compact' | 'summary';
  /** Status map for each tag value */
  statusMap?: Record<string, 'valid' | 'missing' | 'pending' | 'unknown'>;
  /** Maximum tags to show before "show more" */
  maxVisible?: number;
}

// Parse contract tags from a raw string
export function parseContractTags(rawString: string): ParsedTag[] {
  if (!rawString || typeof rawString !== 'string') {
    return [];
  }

  const tags: ParsedTag[] = [];
  const tagPattern = /\b(FILE|DIR|ENV|POLICY|EVIDENCE|VALIDATE|GATE|AUDIT|ARTIFACT):([^;]+)/gi;

  let match;
  while ((match = tagPattern.exec(rawString)) !== null) {
    const type = match[1].toUpperCase() as ContractTagType;
    const value = match[2].trim();
    tags.push({
      type,
      value,
      raw: match[0],
    });
  }

  return tags;
}

// Check if a string contains contract tags
export function hasContractTags(rawString: string): boolean {
  if (!rawString) return false;
  return /\b(FILE|DIR|ENV|POLICY|EVIDENCE|VALIDATE|GATE|AUDIT|ARTIFACT):/i.test(rawString);
}

// Get tag counts by type
export function getTagCounts(tags: ParsedTag[]): { type: ContractTagType; count: number }[] {
  const counts: Record<ContractTagType, number> = {
    FILE: 0,
    DIR: 0,
    ENV: 0,
    POLICY: 0,
    EVIDENCE: 0,
    VALIDATE: 0,
    GATE: 0,
    AUDIT: 0,
    ARTIFACT: 0,
  };

  tags.forEach((tag) => {
    counts[tag.type]++;
  });

  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({ type: type as ContractTagType, count }));
}

export default function ContractTagList({
  rawString,
  mode = 'full',
  statusMap = {},
  maxVisible = 10,
}: ContractTagListProps) {
  const tags = useMemo(() => parseContractTags(rawString), [rawString]);
  const tagCounts = useMemo(() => getTagCounts(tags), [tags]);

  if (tags.length === 0) {
    return <div className="text-sm text-gray-500 italic">No contract tags found</div>;
  }

  // Summary mode - just show counts
  if (mode === 'summary') {
    return <ContractTagSummary tags={tagCounts} />;
  }

  // Compact mode - inline badges
  if (mode === 'compact') {
    const visibleTags = tags.slice(0, maxVisible);
    const hiddenCount = tags.length - maxVisible;

    return (
      <div className="flex flex-wrap gap-1">
        {visibleTags.map((tag, idx) => (
          <ContractTagBadge
            key={`${tag.type}-${tag.value}-${idx}`}
            type={tag.type}
            value={tag.value}
            status={statusMap[tag.value]}
            compact
          />
        ))}
        {hiddenCount > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-gray-500 bg-gray-100 rounded">
            +{hiddenCount} more
          </span>
        )}
      </div>
    );
  }

  // Full mode - detailed list grouped by type
  const groupedTags = useMemo(() => {
    const groups: Record<ContractTagType, ParsedTag[]> = {
      FILE: [],
      DIR: [],
      ENV: [],
      POLICY: [],
      EVIDENCE: [],
      VALIDATE: [],
      GATE: [],
      AUDIT: [],
      ARTIFACT: [],
    };

    tags.forEach((tag) => {
      groups[tag.type].push(tag);
    });

    return groups;
  }, [tags]);

  const orderedTypes: ContractTagType[] = [
    'FILE',
    'DIR',
    'ENV',
    'POLICY',
    'EVIDENCE',
    'VALIDATE',
    'GATE',
    'AUDIT',
    'ARTIFACT',
  ];

  return (
    <div className="space-y-3">
      {orderedTypes.map((type) => {
        const typeTags = groupedTags[type];
        if (typeTags.length === 0) return null;

        return (
          <div key={type} className="space-y-1">
            {typeTags.map((tag, idx) => (
              <ContractTagBadge
                key={`${tag.type}-${tag.value}-${idx}`}
                type={tag.type}
                value={tag.value}
                status={statusMap[tag.value]}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Utility component to display contract compliance status
export function ContractComplianceIndicator({
  prerequisites,
  artifacts,
  validation,
}: {
  prerequisites: string;
  artifacts: string;
  validation: string;
}) {
  const prereqTags = parseContractTags(prerequisites);
  const artifactTags = parseContractTags(artifacts);
  const validationTags = parseContractTags(validation);

  const hasPrereqs = prereqTags.length > 0;
  const hasArtifacts = artifactTags.length > 0;
  const hasValidation = validationTags.length > 0;
  const hasContextAck = artifactTags.some(
    (t) => t.type === 'EVIDENCE' && t.value === 'context_ack'
  );

  const allComplete = hasPrereqs && hasArtifacts && hasValidation && hasContextAck;
  const partial = hasPrereqs || hasArtifacts || hasValidation;

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${
          allComplete ? 'bg-green-500' : partial ? 'bg-yellow-500' : 'bg-gray-300'
        }`}
        title={
          allComplete
            ? 'Full contract compliance'
            : partial
              ? 'Partial contract tags'
              : 'No contract tags'
        }
      />
      <div className="flex gap-1">
        <span
          className={`text-xs ${hasPrereqs ? 'text-blue-600' : 'text-gray-400'}`}
          title={`Prerequisites: ${prereqTags.length} tags`}
        >
          P:{prereqTags.length}
        </span>
        <span
          className={`text-xs ${hasArtifacts ? 'text-green-600' : 'text-gray-400'}`}
          title={`Evidence: ${artifactTags.length} tags`}
        >
          E:{artifactTags.length}
        </span>
        <span
          className={`text-xs ${hasValidation ? 'text-cyan-600' : 'text-gray-400'}`}
          title={`Validation: ${validationTags.length} tags`}
        >
          V:{validationTags.length}
        </span>
      </div>
      {hasContextAck && (
        <span className="text-xs text-green-600 font-medium" title="Requires context_ack">
          ACK
        </span>
      )}
    </div>
  );
}
