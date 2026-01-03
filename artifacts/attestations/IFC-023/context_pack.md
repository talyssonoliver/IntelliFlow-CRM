# Context Pack: IFC-023 - AI Explainability UI

## Task Summary

**Task ID**: IFC-023
**Sprint**: 13
**Section**: Intelligence
**Owner**: Frontend Dev + UX (STOA-Domain)

## Objective

Create reusable AI score explanation components that visualize lead scores with factor breakdowns, confidence indicators, and model information.

## Dependencies

- **IFC-022**: AI Scoring Pipeline - Completed (provides score data structure)

## Pre-requisites Verified

- [x] `artifacts/sprint0/codex-run/Framework.md` - Framework guidelines
- [x] `audit-matrix.yml` - Audit requirements
- [x] `docs/company/brand/visual-identity.md` - Brand guidelines
- [x] `apps/api/src/shared/output-validation-test.ts` - Output validation patterns

## Design System References

- **UI Development Prompt**: `docs/design/UI_DEVELOPMENT_PROMPT.md`
- **Design System Index**: `docs/company/brand/DESIGN_SYSTEM_LLM_INDEX.md`
- **Style Guide**: `docs/company/brand/style-guide.md`

## Data Schema

From `packages/validators/src/lead.ts`:

```typescript
export const leadScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  factors: z.array(
    z.object({
      name: z.string(),
      impact: z.number(),
      reasoning: z.string(),
    })
  ),
  modelVersion: z.string(),
});
```

## Component Architecture

### File Structure

```
packages/ui/src/components/score/
├── index.ts                    # Barrel exports
├── types.ts                    # Shared types (derived from leadScoreSchema)
├── utils.ts                    # Helper functions (getScoreTier, etc.)
├── ScoreBadge.tsx              # Compact score display with optional popover
├── ScoreFactor.tsx             # Individual factor row with impact bar
├── ScoreFactorList.tsx         # Expandable list of factors
├── ConfidenceIndicator.tsx     # AI confidence display
├── ModelInfo.tsx               # Model version display
└── ScoreCard.tsx               # Full score panel with all factors
```

### Key Components

1. **ScoreBadge**: Compact score display with tier coloring (hot/warm/cold)
2. **ScoreFactor**: Individual factor row showing impact direction and reasoning
3. **ScoreFactorList**: Expandable list of all scoring factors
4. **ConfidenceIndicator**: Visual confidence level (high/medium/low)
5. **ModelInfo**: AI model version display
6. **ScoreCard**: Full explanation panel combining all components

## Design Compliance

- CSS variables only (`text-foreground`, `bg-card`, `text-success`, etc.)
- Material Symbols Outlined for icons
- CVA for component variants
- cn() for class merging
- WCAG 2.1 AA accessibility

## Definition of Done

1. Score explanations visible, factors breakdown shown
2. Artifacts: user-test-results.pdf, context_ack.json

## Validation Requirements

- TypeScript strict mode passing
- 90%+ test coverage with vitest-axe accessibility tests
- Build succeeds
- Storybook stories for all variants
