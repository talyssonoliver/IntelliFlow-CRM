# Compliance Check — Section 1: Design Compliance (UI Tasks Only)

**Only for tasks with UI components** (pages, components, frontend work — PG-\*,
IFC-090, IFC-091):

```markdown
| Check             | Requirement                                                    |
| ----------------- | -------------------------------------------------------------- |
| Brand Colors      | Uses IntelliFlow brand palette from DESIGN_SYSTEM_LLM_INDEX.md |
| Typography        | Follows typography scale (Inter font family)                   |
| Component Library | Uses shadcn/ui components                                      |
| Responsive        | Mobile-first, works on all breakpoints                         |
| Accessibility     | Meets WCAG 2.1 AA standards                                    |
```

**How to validate:**

1. Read `docs/design/UI_DEVELOPMENT_PROMPT.md`
2. Read `docs/company/brand/DESIGN_SYSTEM_LLM_INDEX.md`
3. Compare implementation against design tokens
4. Run Lighthouse accessibility audit if applicable
