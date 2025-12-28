# Quick Start: Fix Incomplete Tasks

Copy and paste this prompt to Claude Code to begin fixing all 63 incomplete tasks:

---

## PROMPT TO USE

```
Execute /fix-incomplete-tasks

Start iterating through all 63 tasks that are marked "Completed" but missing
EVIDENCE files. For each task:

1. **Analyze** - Read task from Sprint_plan.csv, understand what it requires
2. **Detect Placeholders** - Scan all ARTIFACT: paths for placeholder content
3. **Verify Artifacts** - Check all ARTIFACT: paths exist and are real
4. **Check Dependencies** - Verify all task dependencies are truly complete
5. **Validate KPIs** - Confirm all KPIs in the task are actually met
6. **Execute Validations** - Run any VALIDATE: commands specified

**Decision Logic:**
- If ANY issue found → Change Status to "In Progress", log remediation needed
- If ALL checks pass → Create evidence bundle at artifacts/attestations/<TASK_ID>/

**Never create placeholder files. All evidence must be real.**

Start with the first task and iterate through all 63. Show progress after each task.
Report summary when complete.

The task list is available at:
curl -s http://localhost:3002/api/governance/revert-incomplete | jq '.tasksWithMissingArtifacts[].taskId'

Begin now.
```

---

## EXPECTED OUTPUT

The validator will iterate like this:

```
[1/63] EXC-INIT-001
  ├── Artifacts: ✓/✗
  ├── Placeholders: ✓/✗
  ├── Dependencies: ✓/✗
  ├── KPIs: ✓/✗
  └── Result: COMPLETE or REVERTED

[2/63] AI-SETUP-001
  ...
```

---

## TASK LIST (63 tasks to validate)

1. EXC-INIT-001
2. AI-SETUP-001
3. AI-SETUP-002
4. AI-SETUP-003
5. ENV-001-AI
6. ENV-002-AI
7. ENV-003-AI
8. ENV-004-AI
9. ENV-005-AI
10. ENV-006-AI
11. ENV-007-AI
12. ENV-008-AI
13. ENV-009-AI
14. ENV-010-AI
15. ENV-011-AI
16. ENV-012-AI
17. ENV-013-AI
18. ENV-014-AI
19. ENV-015-AI
20. ENV-016-AI
21. ENV-017-AI
22. ENV-018-AI
23. EP-001-AI
24. AUTOMATION-001
25. AUTOMATION-002
26. IFC-000
27. IFC-001
28. IFC-002
29. IFC-003
30. IFC-004
31. IFC-005
32. IFC-008
33. IFC-044
34. IFC-072
35. IFC-073
36. IFC-074
37. IFC-075
38. IFC-079
39. IFC-080
40. IFC-085
41. DOC-001
42. BRAND-001
43. BRAND-002
44. GTM-001
45. GTM-002
46. SALES-001
47. SALES-002
48. PM-OPS-001
49. ENG-OPS-001
50. GOV-001
51. ANALYTICS-001
52. IFC-101
53. IFC-102
54. IFC-103
55. IFC-104
56. IFC-105
57. IFC-106
58. IFC-109
59. IFC-119
60. IFC-135
61. IFC-146
62. EXC-SEC-001
63. IFC-160

---

## AFTER COMPLETION

Run sync to update metrics dashboard:
```bash
curl -X POST http://localhost:3002/api/sync-metrics
```

Check new mismatch count:
```bash
curl -s http://localhost:3002/api/metrics/executive | jq '{mismatches: .planVsCodeMismatches, revertNeeded: .tasksRequiringRevert}'
```
