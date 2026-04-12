# Output Schema

Use this JSON shape for every finding:

```json
{
  "id": "DBA-001",
  "category": "drift|security|tenancy|performance|consistency",
  "severity": "low|medium|high|critical",
  "confidence": 0.0,
  "evidence": ["string"],
  "affected_objects": ["schema.table", "model.field"],
  "recommendation": "string",
  "migration_risk": "low|medium|high"
}
```

Top-level report shape:

```json
{
  "summary": {
    "snapshot": "path",
    "prismaSchemas": ["path", "path"],
    "totalFindings": 0,
    "confirmed": 0,
    "needsReview": 0
  },
  "confirmed_findings": [],
  "needs_review_findings": []
}
```
