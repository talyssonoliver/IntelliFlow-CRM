---

# **Generate Shared CRM Empty‑State Components**

**INSTRUCTIONS**

You are generating **shared, reusable React/TypeScript components** for a CRM platform called **IntelliFlow**.  
You must read first the brand guidelines, and all elative documentation for this refatoration also use the skills
Search and get the svg's/ilustratiosn on sites like:
https://www.figma.com/community/file/1016767724637326603/empty-state-illustrations
https://www.figma.com/community/file/1112720195672720341/empty-state-illustration-kit
https://www.figma.com/community/file/1435270290154865697/empty-state-illustration-kit

The components must follow these rules:

---

## **1. Component Purpose**

Create a **SharedEmptyState** component that can be reused across all CRM
entities:

- Notes
- Tasks
- Chats
- Appointments
- Files
- Emails
- Timeline
- Activity
- Documents
- Any future module

The component must support **progressive empty‑state micro‑iterations**.

---

## **2. Required Empty‑State Lifecycle (4 States)**

The component must support these states and transitions:

### **1. Passive State**

- Full illustration
- Title
- Short description
- No CTA visible yet

### **2. Soft CTA State**

Triggered by:

- Hover
- Focus
- Scroll into view

Behavior:

- Illustration fades slightly (opacity 100% → 80%)
- CTA animates in (fade + slight upward motion)

### **3. Inline Composer State**

Triggered by:

- Clicking the CTA
- Pressing a hotkey (e.g., “N” for note, “T” for task)

Behavior:

- Illustration collapses or shifts aside
- Inline composer appears (textarea, quick-create row, or message input
  depending on entity)

### **4. Smart Suggestions State**

Triggered by:

- User creates the first item

Behavior:

- Illustration disappears entirely
- Show contextual suggestions (e.g., “Add due date?”, “Assign?”, “Attach file?”)

---

## **3. Component API Requirements**

The component must be configurable via props:

```ts
interface SharedEmptyStateProps {
  entity:
    | 'notes'
    | 'tasks'
    | 'chats'
    | 'appointments'
    | 'files'
    | 'emails'
    | 'timeline'
    | 'activity'
    | 'documents';

  title: string;
  description: string;

  illustration: ReactNode; // SVG or JSX illustration
  ctaLabel: string;
  onCreate: () => void; // triggers inline composer
  suggestions?: string[]; // smart suggestions after first item

  // Optional overrides
  className?: string;
  style?: React.CSSProperties;
}
```

---

## **4. Component Architecture Requirements**

### **A. State Machine**

Implement a simple internal state machine:

```ts
type EmptyStatePhase =
  | 'passive'
  | 'soft-cta'
  | 'inline-composer'
  | 'smart-suggestions';
```

Transitions:

- passive → soft-cta (hover/focus)
- soft-cta → inline-composer (CTA click)
- inline-composer → smart-suggestions (onCreate success)

---

### **B. Animation Requirements**

Use CSS transitions or Framer Motion:

- Illustration fade: `opacity 1 → 0.8`
- CTA entrance: `opacity 0 → 1`, `translateY(4px → 0)`
- Illustration collapse: scale down or slide aside
- Smart suggestions fade-in

---

### **C. Design System Integration**

Use IntelliFlow’s design tokens:

- Spacing: `--space-*`
- Typography: `--font-*`
- Colors: `--color-*`
- Border radius: `--radius-*`
- Shadows: `--shadow-*`
- Icons: `IFIcon` component

---

## **5. Output Requirements**

Produce:

1. `SharedEmptyState.tsx` — main component
2. `useEmptyStateMachine.ts` — hook for transitions
3. `entityEmptyStateConfig.ts` — mapping of entity → default illustration,
   title, description, CTA
4. Example usage for Notes, Tasks, Chats
5. Optional: Fallback skeleton for when illustrations are missing

---

## **6. Coding Style**

- React + TypeScript
- Functional components
- No external UI libraries
- Use IntelliFlow design tokens
- Clean, readable, production‑ready code

---

## **7. Deliverables**

Return:

- Full component code
- Hook code
- Config file
- Example usage
- Explanation of how to extend to new entities

---
