# Create Component Command

Scaffold a new React component with shadcn/ui patterns and TypeScript.

## Usage

```
/create-component <name> [--type=<type>] [--path=<path>]
```

## Arguments

- `name`: Component name (PascalCase)
- `--type`: Component type (ui, feature, page, layout)
- `--path`: Custom path (default: based on type)

## Component Types

### ui (packages/ui/)

Basic reusable UI components following shadcn/ui patterns.

### feature (apps/web/components/)

Feature-specific components with business logic.

### page (apps/web/app/)

Next.js App Router page components.

### layout (apps/web/app/)

Next.js layout components.

## Generated Files

```
ComponentName/
├── index.ts           # Barrel export
├── ComponentName.tsx  # Main component
├── ComponentName.test.tsx  # Unit tests
├── ComponentName.stories.tsx  # Storybook (optional)
└── types.ts           # TypeScript types
```

## Template Structure

```tsx
import { cn } from '@/lib/utils';
import { ComponentNameProps } from './types';

export function ComponentName({ className, ...props }: ComponentNameProps) {
  return (
    <div className={cn('', className)} {...props}>
      {/* Component content */}
    </div>
  );
}
```

## Example

```bash
# Create a UI button variant
/create-component ActionButton --type=ui

# Create a feature component
/create-component LeadScoreCard --type=feature

# Create a page
/create-component dashboard --type=page --path=app/(dashboard)
```
