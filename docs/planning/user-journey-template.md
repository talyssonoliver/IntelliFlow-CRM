# User Journey Map: [Feature Name]

## Journey Overview

| Field | Value |
|-------|-------|
| **Journey Name** | [Descriptive name of user journey] |
| **User Persona** | [Primary user persona] |
| **Goal** | [What the user is trying to achieve] |
| **Feature/Epic** | [Related feature or epic] |
| **Related PRD** | [Link to PRD] |
| **Related Tasks** | [Task IDs from Sprint_plan.csv] |
| **Created Date** | [YYYY-MM-DD] |
| **Last Updated** | [YYYY-MM-DD] |

## User Persona

### [Persona Name]

**Role**: [Job title or user role]

**Background**:
- [Key characteristic 1]
- [Key characteristic 2]
- [Key characteristic 3]

**Goals**:
- [Primary goal]
- [Secondary goal]

**Frustrations**:
- [Pain point 1]
- [Pain point 2]

**Technical Proficiency**: [Novice / Intermediate / Advanced]

**Context of Use**:
- **Frequency**: [Daily / Weekly / Monthly / Occasional]
- **Device**: [Desktop / Mobile / Tablet / Mixed]
- **Environment**: [Office / Remote / On-the-go]
- **Time Pressure**: [High / Medium / Low]

## Journey Scenario

**Trigger**: [What prompts the user to start this journey?]

**Context**: [What is happening when the user begins?]

**Current Solution** (if replacing existing workflow): [How do they do this today?]

**Expected Outcome**: [What success looks like for the user]

## Journey Stages

### Stage 1: [Stage Name - e.g., "Discovery/Awareness"]

**User Goal**: [What the user wants to accomplish in this stage]

**Actions**:
1. [Specific action user takes]
2. [Specific action user takes]
3. [Specific action user takes]

**Touchpoints**:
- **Page/Screen**: [URL or screen name]
- **UI Components**: [Specific buttons, forms, elements]
- **Interactions**: [Click, scroll, input, etc.]

**User Thoughts**:
- "[Internal monologue or question]"
- "[What the user is thinking]"

**User Emotions**:
- **Emotional State**: [Happy / Neutral / Frustrated / Confused / Anxious]
- **Sentiment**: [Why they feel this way]

**Pain Points**:
- [Friction or obstacle 1]
- [Friction or obstacle 2]

**Opportunities**:
- [How we can improve this stage]
- [Feature or enhancement idea]

**Success Criteria**:
- [ ] [Measurable criterion 1]
- [ ] [Measurable criterion 2]

**Metrics**:
- [Metric to track]: [Target value]

---

### Stage 2: [Stage Name - e.g., "Consideration/Evaluation"]

**User Goal**: [What the user wants to accomplish in this stage]

**Actions**:
1. [Specific action user takes]
2. [Specific action user takes]
3. [Specific action user takes]

**Touchpoints**:
- **Page/Screen**: [URL or screen name]
- **UI Components**: [Specific buttons, forms, elements]
- **Interactions**: [Click, scroll, input, etc.]

**User Thoughts**:
- "[Internal monologue or question]"
- "[What the user is thinking]"

**User Emotions**:
- **Emotional State**: [Happy / Neutral / Frustrated / Confused / Anxious]
- **Sentiment**: [Why they feel this way]

**Pain Points**:
- [Friction or obstacle 1]
- [Friction or obstacle 2]

**Opportunities**:
- [How we can improve this stage]
- [Feature or enhancement idea]

**Success Criteria**:
- [ ] [Measurable criterion 1]
- [ ] [Measurable criterion 2]

**Metrics**:
- [Metric to track]: [Target value]

---

### Stage 3: [Stage Name - e.g., "Conversion/Action"]

**User Goal**: [What the user wants to accomplish in this stage]

**Actions**:
1. [Specific action user takes]
2. [Specific action user takes]
3. [Specific action user takes]

**Touchpoints**:
- **Page/Screen**: [URL or screen name]
- **UI Components**: [Specific buttons, forms, elements]
- **Interactions**: [Click, scroll, input, etc.]

**User Thoughts**:
- "[Internal monologue or question]"
- "[What the user is thinking]"

**User Emotions**:
- **Emotional State**: [Happy / Neutral / Frustrated / Confused / Anxious]
- **Sentiment**: [Why they feel this way]

**Pain Points**:
- [Friction or obstacle 1]
- [Friction or obstacle 2]

**Opportunities**:
- [How we can improve this stage]
- [Feature or enhancement idea]

**Success Criteria**:
- [ ] [Measurable criterion 1]
- [ ] [Measurable criterion 2]

**Metrics**:
- [Metric to track]: [Target value]

---

### Stage 4: [Stage Name - e.g., "Retention/Follow-up"]

**User Goal**: [What the user wants to accomplish in this stage]

**Actions**:
1. [Specific action user takes]
2. [Specific action user takes]
3. [Specific action user takes]

**Touchpoints**:
- **Page/Screen**: [URL or screen name]
- **UI Components**: [Specific buttons, forms, elements]
- **Interactions**: [Click, scroll, input, etc.]

**User Thoughts**:
- "[Internal monologue or question]"
- "[What the user is thinking]"

**User Emotions**:
- **Emotional State**: [Happy / Neutral / Frustrated / Confused / Anxious]
- **Sentiment**: [Why they feel this way]

**Pain Points**:
- [Friction or obstacle 1]
- [Friction or obstacle 2]

**Opportunities**:
- [How we can improve this stage]
- [Feature or enhancement idea]

**Success Criteria**:
- [ ] [Measurable criterion 1]
- [ ] [Measurable criterion 2]

**Metrics**:
- [Metric to track]: [Target value]

---

## Alternative Paths

### Alternative Path 1: [Error/Exception Scenario]

**Trigger**: [What causes this alternative path?]

**Affected Stages**: [Stage 2, Stage 3, etc.]

**Actions**:
1. [What happens differently]
2. [How user recovers or exits]

**User Experience**:
- **Error Message**: [Exact text]
- **Recovery Options**: [What user can do]
- **Exit Points**: [How to leave this flow]

**Success Criteria**:
- [ ] [How we know user recovered successfully]

---

### Alternative Path 2: [Optional Feature/Shortcut]

**Trigger**: [What causes this alternative path?]

**Affected Stages**: [Stage 1, Stage 4, etc.]

**Actions**:
1. [What happens differently]
2. [How this path differs from main flow]

**User Experience**:
- **Benefits**: [Why user would choose this path]
- **Trade-offs**: [What they give up]

**Success Criteria**:
- [ ] [How we know this path succeeded]

---

## Technical Implementation

### Required API Endpoints

| Stage | Method | Endpoint | Purpose |
|-------|--------|----------|---------|
| Stage 1 | GET | `/api/[resource]` | [Fetch initial data] |
| Stage 2 | POST | `/api/[resource]` | [Submit form data] |
| Stage 3 | PUT | `/api/[resource]/:id` | [Update resource] |
| Stage 4 | GET | `/api/[resource]/:id/status` | [Check status] |

### tRPC Procedures

```typescript
// apps/api/src/modules/[module]/[module].router.ts
export const [module]Router = router({
  // Stage 1: Initial data fetch
  getInitialData: protectedProcedure
    .query(async ({ ctx }) => {
      // Implementation
    }),

  // Stage 2: Submit action
  submitAction: protectedProcedure
    .input([schema])
    .mutation(async ({ input, ctx }) => {
      // Implementation
    }),

  // Stage 3: Update state
  updateState: protectedProcedure
    .input([schema])
    .mutation(async ({ input, ctx }) => {
      // Implementation
    }),
});
```

### Required UI Components

| Stage | Component | Purpose | Location |
|-------|-----------|---------|----------|
| Stage 1 | `[ComponentName]` | [Description] | `packages/ui/src/components/` |
| Stage 2 | `[ComponentName]` | [Description] | `packages/ui/src/components/` |
| Stage 3 | `[ComponentName]` | [Description] | `packages/ui/src/components/` |

### State Management

**Client State**:
- [State variable 1]: [Purpose]
- [State variable 2]: [Purpose]

**Server State (React Query/tRPC)**:
- [Query 1]: [Data being cached]
- [Mutation 1]: [Action being optimized]

**Form State**:
- Form library: [React Hook Form / Formik / Other]
- Validation: [Zod schema reference]

### Data Flow

```
User Action → UI Component → tRPC Client → API Router → Use Case → Domain Logic → Repository → Database
                                                                                         ↓
User sees result ← UI Update ← tRPC Response ← API Response ← Use Case Result ← Domain Event
```

## User Experience Principles

### Design Principles for This Journey

1. **[Principle 1 - e.g., "Progressive Disclosure"]**
   - [How this applies to the journey]
   - [Examples in specific stages]

2. **[Principle 2 - e.g., "Immediate Feedback"]**
   - [How this applies to the journey]
   - [Examples in specific stages]

3. **[Principle 3 - e.g., "Error Prevention"]**
   - [How this applies to the journey]
   - [Examples in specific stages]

### Accessibility Considerations

- [ ] Keyboard navigation supported throughout journey
- [ ] Screen reader announcements for state changes
- [ ] Focus management between stages
- [ ] Error messages are announced
- [ ] Loading states are communicated
- [ ] WCAG 2.1 AA compliance verified

### Performance Targets

| Stage | Metric | Target | Measurement |
|-------|--------|--------|-------------|
| Stage 1 | Time to Interactive | <2s | Lighthouse |
| Stage 2 | Form submission time | <500ms | Custom timing |
| Stage 3 | Update response time | <200ms | OpenTelemetry |
| Overall | Journey completion time | <[X]min | Analytics |

## Success Metrics

### User Behavior Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Journey Completion Rate | ≥[X]% | Analytics funnel |
| Average Time to Complete | <[X] minutes | Analytics timing |
| Drop-off Rate | <[X]% | Analytics funnel |
| Error Rate | <[X]% | Error tracking |
| Retry Rate | <[X]% | Analytics events |

### User Satisfaction Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Task Success Rate | ≥[X]% | Usability testing |
| User Satisfaction (CSAT) | ≥[X]/5 | In-app survey |
| Net Promoter Score (NPS) | ≥[X] | Post-journey survey |
| Time on Task | <[X] minutes | Analytics |

### Business Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Conversion Rate | ≥[X]% | Analytics |
| Revenue Impact | +[X]% | Business analytics |
| Cost Savings | -[X] hours/week | Time tracking |
| Support Tickets | -[X]% | Support system |

## Validation Plan

### Usability Testing

**Participants**: [Number and characteristics]

**Test Scenario**: [Describe the scenario you'll give users]

**Tasks**:
1. [Specific task to complete]
2. [Specific task to complete]
3. [Specific task to complete]

**Success Criteria**:
- [ ] [X]% of users complete journey without assistance
- [ ] [X]% of users report satisfaction ≥4/5
- [ ] Average time to complete <[X] minutes
- [ ] Error rate <[X]%

**Observation Points**:
- [What to watch for in Stage 1]
- [What to watch for in Stage 2]
- [What to watch for in Stage 3]

### A/B Testing (if applicable)

**Hypothesis**: [What we're testing]

**Variant A**: [Control - current design]

**Variant B**: [Treatment - new design]

**Success Metric**: [Primary metric to compare]

**Sample Size**: [Required users per variant]

**Duration**: [How long to run test]

## Journey Map Visualization

```
[User Emotion Graph - plot emotional state across stages]

Stage 1        Stage 2        Stage 3        Stage 4
  |              |              |              |
Happy ━━━┓                 ┏━━━━━━━━━━━━━━━━━┛
         ┃                 ┃
Neutral  ┃     ┏━━━━━━━━━━┛
         ┃     ┃
Frustrated ┗━━┛

[Touchpoint Timeline - show screens/pages in sequence]

Entry → [Screen 1] → [Screen 2] → [Screen 3] → Success
         │            │            │
    [Action 1]   [Action 2]   [Action 3]
```

## Key Insights

### What We Learned

1. **[Insight 1]**
   - [Supporting evidence]
   - [Implication for design]

2. **[Insight 2]**
   - [Supporting evidence]
   - [Implication for design]

3. **[Insight 3]**
   - [Supporting evidence]
   - [Implication for design]

### Recommended Improvements

**Priority 1 (Critical)**:
- [Improvement 1] - [Why it's critical]

**Priority 2 (High)**:
- [Improvement 2] - [Why it's important]

**Priority 3 (Nice to have)**:
- [Improvement 3] - [Why it would help]

## Appendices

### Appendix A: User Research Data

- [Link to research findings]
- [Link to interview transcripts]
- [Link to survey results]

### Appendix B: Design Assets

- [Link to wireframes]
- [Link to mockups]
- [Link to prototype]

### Appendix C: Related Documentation

- PRD: `docs/planning/prd-[feature].md`
- ADR: `docs/planning/adr/[number]-[title].md`
- Sprint Plan: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | [YYYY-MM-DD] | [Name] | Initial journey map |
| 1.1 | [YYYY-MM-DD] | [Name] | [Changes based on feedback] |

---

## Template Usage Instructions

**When to Use This Template:**
- Before designing a new feature
- When redesigning an existing workflow
- When investigating user experience issues
- When planning sprint work that affects user interaction

**How to Fill Out:**
1. Start with **Journey Overview** and **User Persona** sections
2. Break the journey into **4-6 logical stages**
3. For each stage, document actions, touchpoints, emotions, and pain points
4. Identify **alternative paths** (errors, shortcuts)
5. Map to **technical implementation** requirements
6. Define **success metrics** and **validation plan**
7. Review with team and stakeholders
8. Update based on usability testing or user feedback

**Tips:**
- Use real user quotes in "User Thoughts"
- Be specific about UI elements in "Touchpoints"
- Include actual error messages and copy
- Connect to Sprint_plan.csv tasks for traceability
- Update journey map as you learn from users
- Share with designers, developers, and QA for alignment
