# Sprint Risk Review Agenda

**Version:** 1.0
**Created:** 2025-12-28
**Task:** IFC-118
**Owner:** STOA-Foundation
**Meeting Cadence:** End of each sprint (bi-weekly)

---

## 1. Meeting Overview

### 1.1 Purpose

Review all project risks, update scores, validate mitigations, and escalate as needed.

### 1.2 Schedule

| Sprint | Review Date | Status |
|--------|-------------|--------|
| Sprint 0 | 2025-01-03 | Scheduled |
| Sprint 1 | 2025-01-17 | Planned |
| Sprint 2 | 2025-01-31 | Planned |
| Sprint 3 | 2025-02-14 | Planned |
| Sprint 4 | 2025-02-28 | Planned |
| Sprint 5 | 2025-03-14 | Planned |
| Sprint 6 | 2025-03-28 | Planned |
| Sprint 7 | 2025-04-11 | Planned |
| Sprint 8 | 2025-04-25 | Planned |

### 1.3 Participants

| Role | Attendance | Responsibilities |
|------|------------|------------------|
| PM | Required | Facilitate, document decisions |
| Tech Lead | Required | Technical risk assessment |
| DevOps Lead | Required | Infrastructure risk status |
| Security Lead | Required (or delegate) | Security risk updates |
| QA Lead | Required (or delegate) | Quality risk updates |
| AI Lead | Required (or delegate) | AI/ML risk updates |
| Scrum Master | Optional | Process risk insights |
| Stakeholder Rep | Optional | Business risk perspective |

### 1.4 Duration

**Target:** 30 minutes (45 minutes max)

---

## 2. Pre-Meeting Preparation

### 2.1 Risk Owner Checklist

Before each sprint risk review, all risk owners must:

- [ ] Update risk status in `artifacts/reports/risk-register.csv`
- [ ] Document any new risks identified during sprint
- [ ] Prepare evidence of mitigation actions taken
- [ ] Calculate updated likelihood/impact scores
- [ ] Identify any escalation requirements
- [ ] Note any risks that can be closed

### 2.2 PM Checklist

- [ ] Generate current risk summary from register
- [ ] Review KRI dashboard for threshold breaches
- [ ] Prepare agenda with focus areas
- [ ] Send calendar invite with materials 24h in advance
- [ ] Identify top 3 risks for deep-dive discussion

### 2.3 Materials to Prepare

| Document | Location | Owner |
|----------|----------|-------|
| Risk Register (current) | `artifacts/reports/risk-register.csv` | PM |
| Risk Mitigation Plan | `docs/shared/risk-mitigation-plan.md` | PM |
| KRI Dashboard | `artifacts/reports/weekly-cost-report.csv` | DevOps |
| Security Scan Results | CI pipeline outputs | Security Lead |
| Test Coverage Report | `artifacts/coverage/` | QA Lead |
| AI Cost Report | Cost tracking dashboard | AI Lead |

---

## 3. Meeting Agenda

### 3.1 Opening (2 minutes)

**Facilitator:** PM

- Welcome and attendance check
- Confirm agenda and time-box
- Note any late additions to agenda

### 3.2 KRI Dashboard Review (5 minutes)

**Facilitator:** DevOps Lead

Review Key Risk Indicators:

| Indicator | Target | Current | Status |
|-----------|--------|---------|--------|
| CI Pipeline Success | > 99% | [CURRENT] | [OK/WARN/ALERT] |
| API Response p99 | < 200ms | [CURRENT] | [OK/WARN/ALERT] |
| Test Coverage | > 90% | [CURRENT] | [OK/WARN/ALERT] |
| AI API Spend | < $100/mo | [CURRENT] | [OK/WARN/ALERT] |
| Critical Vulns | 0 | [CURRENT] | [OK/WARN/ALERT] |
| Unreviewed AI Outputs | < 10/day | [CURRENT] | [OK/WARN/ALERT] |

**Discussion:** Any KRI threshold breaches require immediate risk assessment update.

### 3.3 Risk Register Walk-Through (10 minutes)

**Facilitator:** PM

For each risk category, owner provides 1-2 minute update:

#### Technology Risks (Tech Lead)
- RISK-001: LangChain API changes
- RISK-005: Performance degradation
- RISK-012: CrewAI agent failures

#### Security Risks (Security Lead)
- RISK-006: Authentication bypass
- RISK-007: SQL injection
- RISK-010: Vulnerable dependencies

#### AI Risks (AI Lead)
- RISK-004: API cost overruns
- RISK-011: LLM hallucination
- RISK-023: Unreviewed outputs

#### Infrastructure Risks (DevOps Lead)
- RISK-002: Vendor lock-in
- RISK-009: Single region failure
- RISK-013: Connection pool

#### Business/Process Risks (PM)
- RISK-016: Competitor launches
- RISK-024: Budget overruns
- RISK-021: Swarm errors

**For Each Risk, Report:**
1. Current score (likelihood x impact)
2. Score change since last review (+/- or stable)
3. Mitigation status (On Track / At Risk / Blocked)
4. Any escalation needed

### 3.4 Deep-Dive on Top 3 Risks (8 minutes)

**Facilitator:** PM

Focus on:
1. Highest score risks
2. Risks with increased scores
3. Risks with blocked mitigations

**Discussion Template:**

```
Risk: [RISK-XXX]
Current Score: [XX] (was [XX])
Mitigation Status: [Status]
Blocker: [If any]
Proposed Action: [Specific next step]
Owner: [Name]
Due Date: [Date]
```

### 3.5 New Risks Identification (3 minutes)

**Facilitator:** PM

- Any new risks identified during the sprint?
- Score new risks using 1-5 likelihood x 1-5 impact matrix
- Assign owners to new risks

**Quick Assessment Template:**

| New Risk | Category | L | I | Score | Owner |
|----------|----------|---|---|-------|-------|
| [Description] | [Cat] | [1-5] | [1-5] | [LxI] | [Name] |

### 3.6 Escalation Review (2 minutes)

**Facilitator:** PM

- Review any pending escalations
- Confirm escalation decisions made
- Document escalation outcomes

### 3.7 Closing (2 minutes)

**Facilitator:** PM

- Summarize action items
- Confirm next review date
- Any final comments

---

## 4. Post-Meeting Actions

### 4.1 Immediate (within 1 hour)

- [ ] Update risk register with new scores
- [ ] Create action items in sprint backlog
- [ ] Send meeting summary to all participants
- [ ] Execute any urgent escalations

### 4.2 Within 24 Hours

- [ ] Update mitigation plan if strategies changed
- [ ] Add new risks to register with full details
- [ ] Notify stakeholders of any score changes > 5 points

### 4.3 Action Item Template

```markdown
## Action Item: [Title]

**Risk ID:** RISK-XXX
**Owner:** [Name]
**Due Date:** [YYYY-MM-DD]
**Priority:** [High/Medium/Low]

### Description
[What needs to be done]

### Expected Outcome
[What success looks like]

### Verification
[How to confirm completion]
```

---

## 5. Review Checklist

### 5.1 Sprint Risk Review Validation

Use this checklist to ensure review completeness:

- [ ] All risk owners provided updates
- [ ] KRI dashboard reviewed
- [ ] All risks in register reviewed
- [ ] Top 3 risks had deep-dive discussion
- [ ] New risks identified and scored
- [ ] Escalations addressed
- [ ] Action items assigned with owners and dates
- [ ] Next review scheduled
- [ ] Meeting notes distributed
- [ ] Risk register updated in repository

### 5.2 Quality Gates for Risk Management

| Gate | Criteria | Status |
|------|----------|--------|
| Coverage | All identified risks tracked | [PASS/FAIL] |
| Currency | All risks reviewed within 4 weeks | [PASS/FAIL] |
| Mitigation | All Medium+ risks have active mitigation | [PASS/FAIL] |
| Ownership | All risks have assigned owner | [PASS/FAIL] |
| Evidence | Mitigations have documented evidence | [PASS/FAIL] |

---

## 6. Stakeholder Communication

### 6.1 Post-Review Summary Template

```markdown
# Sprint [X] Risk Review Summary

**Date:** [YYYY-MM-DD]
**Attendees:** [Names]

## Risk Overview

| Category | Count | Critical | High | Medium | Low |
|----------|-------|----------|------|--------|-----|
| All Risks | [N] | [N] | [N] | [N] | [N] |

## Changes This Sprint

**Increased Risk:**
- [RISK-XXX]: [Brief description] [Old Score] -> [New Score]

**Decreased Risk:**
- [RISK-XXX]: [Brief description] [Old Score] -> [New Score]

**New Risks:**
- [RISK-XXX]: [Brief description] [Score]

**Closed Risks:**
- [RISK-XXX]: [Brief description] [Reason]

## Top Concerns

1. [Most critical concern]
2. [Second concern]
3. [Third concern]

## Action Items

| Action | Owner | Due Date |
|--------|-------|----------|
| [Action] | [Name] | [Date] |

## Next Review

**Date:** [YYYY-MM-DD]
```

---

## 7. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-28 | STOA-Foundation | Initial creation for IFC-118 |

---

## References

- Risk Register: `artifacts/reports/risk-register.csv`
- Risk Mitigation Plan: `docs/shared/risk-mitigation-plan.md`
- Risk Assessment: `artifacts/reports/risk-assessment.csv`
- Cost Reports: `artifacts/reports/weekly-cost-report.csv`
