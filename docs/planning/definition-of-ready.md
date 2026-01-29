# Definition of Ready (DoR)

## Overview

The Definition of Ready is a checklist that ensures user stories are
sufficiently detailed and prepared before being pulled into a sprint. This
prevents blocked work, reduces waste, and improves sprint predictability.

**Purpose:**

- Ensure stories are clear and actionable
- Reduce mid-sprint clarifications and blockers
- Enable accurate estimation
- Improve sprint commitment reliability

**When to Use:**

- Before sprint planning
- During backlog refinement
- When accepting new feature requests

## Definition of Ready Checklist

### Story Structure

- [ ] **User story follows template**
  - Uses "As a [user], I want [capability], so that [benefit]" format
  - Clear identification of user persona
  - Articulates value/benefit to user or business
  - Story is written from user perspective (not technical implementation)

- [ ] **Story title is clear and descriptive**
  - Title summarizes the story in <50 characters
  - Title follows convention: `[User Type] - [Action/Capability]`
  - Example: "Sales Rep - View lead score on contact card"

- [ ] **Story has unique identifier**
  - Referenced in `Sprint_plan.csv` with task ID
  - Linked to PRD (if applicable)
  - Tagged with appropriate labels (feature, bug, enhancement)

### Acceptance Criteria

- [ ] **Acceptance criteria are clear and testable**
  - All criteria use "Given/When/Then" format OR checklist format
  - Criteria are specific and measurable
  - Success conditions are unambiguous
  - Failure conditions are defined
  - No vague terms ("should work", "looks good", "user-friendly")

- [ ] **Functional requirements specified**
  - Happy path defined
  - Edge cases identified
  - Error handling specified
  - Data validation rules listed

- [ ] **Non-functional requirements specified**
  - Performance targets (response time, throughput)
  - Security requirements (authentication, authorization)
  - Accessibility requirements (WCAG level)
  - Browser/device compatibility specified

- [ ] **Examples provided (if complex)**
  - Sample inputs and expected outputs
  - Screenshots/mockups attached
  - Example data scenarios

### Estimation

- [ ] **Story is estimated**
  - Estimation method: [Story points / T-shirt sizes / Hours]
  - Team has discussed and agreed on estimate
  - Estimate reflects complexity, effort, and risk
  - Story is small enough to complete in one sprint
  - If estimate is too large, story is broken down

- [ ] **Estimation is within acceptable range**
  - Maximum story size: [5 points / L / 16 hours] (adjust per team)
  - If larger, story must be split
  - Clear definition of why this size is appropriate

- [ ] **Technical complexity assessed**
  - Complexity level: Low / Medium / High
  - Unknowns identified and flagged
  - Spike needed: Yes / No (if yes, spike story created)

### Dependencies

- [ ] **All dependencies identified**
  - Prerequisites listed (from `Sprint_plan.csv` Dependencies column)
  - Blocking tasks are in progress or completed
  - External dependencies noted (other teams, vendors, approvals)
  - Data dependencies specified

- [ ] **Dependency status verified**
  - All blocking tasks have status "Completed" in Sprint_plan.csv
  - External dependencies have committed delivery dates
  - No circular dependencies exist

- [ ] **Integration points documented**
  - APIs/services this story depends on
  - Data sources required
  - Third-party integrations needed
  - Environment prerequisites (database, infrastructure)

### Technical Approach

- [ ] **Technical approach discussed**
  - Team has reviewed implementation approach
  - Architectural implications considered
  - Technology choices agreed upon
  - Potential challenges identified

- [ ] **Technical design available (if complex)**
  - Architecture Decision Record (ADR) created (if applicable)
  - Sequence diagrams for complex flows
  - Database schema changes specified
  - API contracts defined (tRPC procedures, Zod schemas)

- [ ] **Impact on existing system assessed**
  - Affected components identified
  - Breaking changes flagged
  - Migration strategy defined (if applicable)
  - Rollback plan outlined

- [ ] **Testing strategy defined**
  - Unit test requirements specified
  - Integration test scenarios listed
  - E2E test cases identified
  - Performance test criteria defined
  - Coverage targets: Overall ≥90%, Domain ≥95%

### Design and UX

- [ ] **UX designs attached (if UI changes)**
  - Wireframes or mockups provided
  - All states shown (loading, error, empty, success)
  - Mobile and desktop views (if responsive)
  - Accessibility considerations documented

- [ ] **Design review completed**
  - Design team has approved mockups
  - Feedback incorporated
  - Design is feasible with current tech stack

- [ ] **User flow documented**
  - User journey map created (use `user-journey-template.md`)
  - Entry and exit points defined
  - Alternative paths identified
  - Error recovery flows shown

### Data and Content

- [ ] **Data requirements specified**
  - Data sources identified
  - Data format defined (schemas, types)
  - Data validation rules specified
  - Sample data available for testing

- [ ] **Data migration plan (if applicable)**
  - Existing data migration strategy
  - Data transformation rules
  - Rollback plan for data changes

- [ ] **Content requirements defined**
  - Copy/text finalized
  - Internationalization needs identified
  - Placeholder content provided for testing

### Security and Compliance

- [ ] **Security requirements reviewed**
  - Authentication/authorization requirements
  - Data sensitivity classified
  - Encryption needs identified (at rest, in transit)
  - Input validation and sanitization specified

- [ ] **Compliance requirements identified**
  - GDPR/data privacy implications
  - Audit logging requirements
  - Regulatory compliance (ISO 42001, etc.)
  - Data retention policies

### Documentation

- [ ] **PRD created (if applicable)**
  - PRD follows `prd-template.md`
  - All sections completed
  - Stakeholders reviewed and approved

- [ ] **Definition of Done reviewed**
  - Team agrees on what "done" means for this story
  - DoD includes all quality gates
  - Deployment criteria specified

- [ ] **Related documentation identified**
  - Existing docs that need updates
  - New docs that need creation
  - API documentation requirements

### Stakeholder Alignment

- [ ] **Business value clear**
  - Problem statement articulated
  - Expected business impact quantified
  - Success metrics defined (from PRD)
  - KPIs from `Sprint_plan.csv` verified

- [ ] **Stakeholders identified**
  - Product Owner approval obtained
  - Relevant subject matter experts consulted
  - Customer input gathered (if applicable)

- [ ] **Priority confirmed**
  - Story priority is clear (Critical/High/Medium/Low)
  - Priority aligns with sprint goals
  - Trade-offs discussed and accepted

## Story Size Guidelines

### Ideal Story Size

A ready story should be:

- **Completable in 1-3 days** by one developer
- **Independently deployable** (or clearly part of a feature set)
- **Testable in isolation** (or with minimal dependencies)
- **Valuable to users** (or clearly an enabler for future value)

### When to Split Stories

Split if:

- Estimate exceeds team's maximum story size
- Story spans multiple user personas
- Story has multiple independent acceptance criteria
- Story has complex dependencies that can be decoupled
- Story includes "and" or "or" in the title

### Splitting Techniques

1. **By user persona**: One story per user type
2. **By workflow step**: One story per step in user journey
3. **By business rule**: One story per rule variation
4. **By data**: One story per data type/entity
5. **By CRUD operation**: Create, Read, Update, Delete as separate stories
6. **By acceptance criteria**: Each criterion becomes a story
7. **By technical layer**: API story, UI story, integration story

## Common DoR Pitfalls

### Anti-Patterns to Avoid

- **Too vague**: "As a user, I want the system to work better"
  - Fix: Specify what "better" means with measurable criteria

- **Too technical**: "As a developer, I want to refactor the authentication
  module"
  - Fix: Reframe from user perspective or create a technical task

- **Hidden dependencies**: Story seems ready but blocks on undiscovered
  dependency
  - Fix: Conduct dependency mapping session

- **Over-specified**: Story includes implementation details that constrain
  developers
  - Fix: Focus on "what" and "why", not "how"

- **Missing acceptance criteria**: Story has title but no clear done state
  - Fix: Use checklist or Given/When/Then format

- **No designs for UI work**: Story involves UI changes but no mockups
  - Fix: Attach wireframes or defer until designs ready

## Handling Exceptions

### When DoR Can Be Relaxed

In rare cases, a story may enter a sprint without meeting full DoR if:

1. **Spike Story**: Story is explicitly a research/investigation task
   - Must still have: Clear questions to answer, time box, output format

2. **Urgent Production Issue**: Critical bug requires immediate attention
   - Must still have: Reproduction steps, acceptance criteria, rollback plan

3. **Enabling Work**: Story unblocks other critical work
   - Must still have: Clear deliverable, dependencies verified, DoD defined

**Process for Exceptions:**

- Product Owner must explicitly approve exception
- Team must acknowledge increased risk
- Story must be marked with "DoR Exception" label
- Retrospective must review whether exception was warranted

## Definition of Ready vs Definition of Done

| Definition of Ready (DoR)              | Definition of Done (DoD)                 |
| -------------------------------------- | ---------------------------------------- |
| **Before** work starts                 | **After** work completes                 |
| Story is **ready to pull** into sprint | Story is **ready to ship** to production |
| Ensures clarity and preparation        | Ensures quality and completeness         |
| Prevents blocked work                  | Prevents technical debt                  |
| Owned by **Product Owner** + Team      | Owned by **Team**                        |

## Checklist Review Process

### During Backlog Refinement

1. Product Owner presents story
2. Team reviews DoR checklist together
3. Gaps identified and assigned for resolution
4. Story marked "Ready" or "Needs Work"
5. Repeat until story meets all criteria

### Before Sprint Planning

1. Product Owner pre-screens stories against DoR
2. Only "Ready" stories included in sprint planning candidates
3. Team does final verification during planning
4. Stories failing DoR are deferred to next sprint

## Tools and Templates

### Related Templates

- **PRD Template**: `docs/planning/prd-template.md`
- **User Journey Template**: `docs/planning/user-journey-template.md`
- **ADR Template**: `docs/planning/adr/000-template.md`

### Sprint Plan Integration

All stories should reference tasks in:

- **Sprint Plan CSV**:
  `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`

Verify:

- Task ID exists in Sprint_plan.csv
- Dependencies column lists all prerequisites
- Definition of Done column matches acceptance criteria
- KPIs column defines measurable success metrics

### Metrics to Track

Monitor these metrics to improve DoR effectiveness:

- **% of stories meeting DoR before sprint planning**
  - Target: >80%
  - Measure: Count of "Ready" vs "Total" stories

- **Stories pulled into sprint without full DoR**
  - Target: <10%
  - Measure: Count of "DoR Exception" stories

- **Mid-sprint blockers due to incomplete DoR**
  - Target: <5%
  - Measure: Count of blocked stories with root cause = incomplete DoR

- **Story size variance**
  - Target: Actual time within 50% of estimate
  - Measure: Compare estimated vs actual hours

## Revision History

| Version | Date       | Author | Changes                                        |
| ------- | ---------- | ------ | ---------------------------------------------- |
| 1.0     | 2025-12-22 | System | Initial template based on IFC-146 requirements |

## References

- IntelliFlow CRM Sprint Plan:
  `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- Agile Best Practices: Definition of Ready criteria
- Team Working Agreement: `docs/planning/team-working-agreement.md` (if exists)
