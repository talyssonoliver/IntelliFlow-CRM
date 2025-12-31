# Compliance Dashboard Mockup

## Overview

This document provides a mockup specification for the IntelliFlow CRM Compliance Dashboard.

## Dashboard Layout

```
+------------------------------------------------------------------+
|  IntelliFlow CRM - Compliance Dashboard                   [User] |
+------------------------------------------------------------------+
|                                                                  |
|  +------------------+  +------------------+  +------------------+ |
|  |  ISO 27001       |  |  ISO 42001       |  |  ISO 14001       | |
|  |  COMPLIANT       |  |  IN PROGRESS     |  |  IN PROGRESS     | |
|  |  Score: 92%      |  |  Score: 78%      |  |  Score: 65%      | |
|  |  Last: 2025-12-29|  |  Last: 2025-12-28|  |  Last: 2025-12-27| |
|  +------------------+  +------------------+  +------------------+ |
|                                                                  |
|  GDPR Compliance Status                                          |
|  +------------------------------------------------------------+  |
|  |  [######################                    ] 68%          |  |
|  |  Data Mapping: Complete | Consent: In Progress | DPO: Yes  |  |
|  +------------------------------------------------------------+  |
|                                                                  |
|  +---------------------------+  +-----------------------------+  |
|  |  Active Controls          |  |  Pending Actions            |  |
|  |  ----------------------   |  |  -------------------------  |  |
|  |  Access Control     [OK]  |  |  1. Update privacy policy   |  |
|  |  Encryption         [OK]  |  |  2. Complete DPA reviews    |  |
|  |  Audit Logging      [OK]  |  |  3. Security training       |  |
|  |  Data Retention     [OK]  |  |  4. Penetration test        |  |
|  |  Backup/Recovery    [OK]  |  |  5. Vendor assessments      |  |
|  +---------------------------+  +-----------------------------+  |
|                                                                  |
|  Compliance Calendar                                             |
|  +------------------------------------------------------------+  |
|  |  Dec 2025                                                  |  |
|  |  [29] Quarterly Review | [31] Annual Audit Due             |  |
|  |  Jan 2026                                                  |  |
|  |  [15] ISO Certification | [30] GDPR Training               |  |
|  +------------------------------------------------------------+  |
|                                                                  |
+------------------------------------------------------------------+
```

## Component Specifications

### Compliance Score Cards

Each compliance framework has a score card showing:
- Framework name (ISO 27001, ISO 42001, ISO 14001, GDPR)
- Status indicator (COMPLIANT, IN PROGRESS, NON-COMPLIANT)
- Compliance score percentage
- Last assessment date

### Control Status Panel

Lists all active security and compliance controls with status:
- Green [OK]: Control implemented and verified
- Yellow [WARN]: Control needs attention
- Red [FAIL]: Control failing or missing

### Pending Actions Queue

Priority-ordered list of compliance tasks requiring action:
- Task description
- Due date
- Assigned owner
- Priority level

### Compliance Calendar

Visual calendar showing:
- Upcoming audits
- Certification renewals
- Training deadlines
- Review meetings

## Data Sources

| Component | Data Source | Refresh Rate |
|-----------|-------------|--------------|
| Score Cards | compliance-assessments table | Daily |
| Controls | security-controls table | Real-time |
| Actions | compliance-tasks table | Real-time |
| Calendar | compliance-events table | Hourly |

## API Endpoints

```typescript
// Get compliance overview
GET /api/compliance/overview

// Get specific framework status
GET /api/compliance/framework/:frameworkId

// List pending actions
GET /api/compliance/actions?status=pending

// Update control status
PUT /api/compliance/controls/:controlId
```

## Implementation Notes

1. Dashboard uses real-time WebSocket updates for control status
2. Score calculations follow framework-specific weighting
3. Export functionality for PDF reports
4. Role-based access: Admin, Compliance Officer, Auditor

## Related Documents

- [ISO 27001 Checklist](../../docs/compliance/iso-27001-checklist.md)
- [ISO 42001 Checklist](../../docs/compliance/iso-42001-checklist.md)
- [ISO 14001 Checklist](../../docs/compliance/iso-14001-checklist.md)
- [ADR Index](../../docs/shared/adr-index.md)

---

*Task: IFC-100 - ADR Registry & Compliance Reporting*
*Created: 2025-12-29*
