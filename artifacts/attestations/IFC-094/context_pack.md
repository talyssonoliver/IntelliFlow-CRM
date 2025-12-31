# Context Pack: IFC-094 - Documents Management - Upload & Sign

**Task ID**: IFC-094
**Sprint**: 8
**Owner**: Backend Dev + Integrations Eng (STOA-Domain)
**Mode**: SWARM
**Created**: 2025-12-28T17:30:00Z

## Objective

Create document management with electronic signing and inline preview capabilities.

## Prerequisites Read

### 1. Framework.md (STOA Framework v4.3)
- **Path**: `artifacts/sprint0/codex-run/Framework.md`
- **SHA256**: `58d6d8ba1603cf0825e5496203e1006af75be84a5bbfc24c04587749bb75a872`
- **Purpose**: Defines governance model, STOA roles, evidence requirements

### 2. Hexagonal Boundaries
- **Path**: `docs/architecture/hex-boundaries.md`
- **SHA256**: `15a836cf6f62107a9325de854278bacbdfb1aa04841da9e1adbef034989b1427`
- **Purpose**: Defines architecture layer rules (IFC-106 dependency)

### 3. Lighthouse 360 Report
- **Path**: `artifacts/lighthouse/lighthouse-360-report.html`
- **SHA256**: `de36c8cea6cea7e6fa5c431da3a95346930986c87024d8c0e4f4639f783b0b28`
- **Purpose**: Contact 360 page performance baseline (IFC-090 dependency)

### 4. Sprint Plan JSON
- **Path**: `apps/project-tracker/docs/metrics/_global/Sprint_plan.json`
- **SHA256**: `6671c615266525488ab159a754fce4b9ea179d6bec0fdf458a175c9531e64ac9`
- **Purpose**: Task definition and dependencies

### 5. Task Registry
- **Path**: `apps/project-tracker/docs/metrics/_global/task-registry.json`
- **SHA256**: `8b18cc773173ecb719be169646d1b7b61af382f5cccd735f947489978447bf34`
- **Purpose**: Central status tracking

## Task Details (from Sprint_plan.json)

```json
{
  "Task ID": "IFC-094",
  "Section": "Core CRM",
  "Description": "Documents Management - Upload & Sign",
  "Owner": "Backend Dev + Integrations Eng (STOA-Domain)",
  "Dependencies": "IFC-090,IFC-106",
  "Pre-requisites": "FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Integration with DocuSign/Adobe Sign;ENV:version history;ENV:inline previews;FILE:artifacts/lighthouse/lighthouse-360-report.html;FILE:docs/architecture/hex-boundaries.md",
  "Definition of Done": "Contracts signed electronically, preview inline; artifacts: e-signature-test.pdf, context_ack.json",
  "Status": "Planned",
  "KPIs": "Contracts signed electronically, preview inline",
  "Target Sprint": "8",
  "Artifacts To Track": "SPEC:.specify/specifications/IFC-094.md;PLAN:.specify/planning/IFC-094.md;EVIDENCE:artifacts/attestations/IFC-094/context_pack.md;EVIDENCE:artifacts/attestations/IFC-094/context_ack.json;ARTIFACT:artifacts/reports/e-signature-test.pdf",
  "Validation Method": "AUDIT:code-review"
}
```

## Dependencies Status

| Dependency | Description | Status |
|------------|-------------|--------|
| IFC-090 | Contact 360 Page | Completed (Sprint 6) |
| IFC-106 | Hexagonal module boundaries | Completed (Sprint 1) |

## KPIs to Meet

1. **Contracts signed electronically**: true
2. **Preview inline**: true

## Evidence Artifacts

1. `artifacts/attestations/IFC-094/context_pack.md` - This file (prerequisites list)
2. `artifacts/attestations/IFC-094/context_ack.json` - Context acknowledgment with SHA256 hashes
3. `artifacts/reports/e-signature-test.pdf` - Test document demonstrating e-signature capability

## Invariants Acknowledged

1. Domain layer cannot depend on infrastructure (hex-boundaries.md)
2. All STOAs must produce structured verdict files (Framework.md Section 2.2)
3. Evidence must be hash-backed (Framework.md Section 8.1)
4. Required artifacts must be created in canonical locations (Framework.md Section 1.2)
5. CSV is single source of truth - agents propose patches, humans approve (Framework.md Section 11.5.1)
6. Electronic signing requires integration with DocuSign/Adobe Sign (Pre-requisites)
7. Document preview must work inline without external navigation

## Document Management Capabilities

The IFC-094 implementation provides:

1. **Document Upload**
   - File upload with drag-and-drop support
   - Multiple file format support (PDF, DOCX, images)
   - Version history tracking
   - Automatic virus scanning

2. **Electronic Signing**
   - Integration with e-signature providers (DocuSign, Adobe Sign)
   - Signature workflow management
   - Audit trail for all signatures
   - Multi-party signing support

3. **Inline Preview**
   - PDF viewer embedded in CRM
   - Document thumbnails in lists
   - Quick preview without download
   - Zoom and navigation controls

4. **Document Organization**
   - Folder structure per contact/account
   - Tagging and categorization
   - Full-text search
   - Access control by role

## Validation Method

AUDIT:code-review - Manual review of:
- E-signature integration code
- Inline preview component
- Document upload handlers
- Hexagonal architecture compliance
