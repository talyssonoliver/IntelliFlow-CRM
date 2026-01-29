# IDE Error Parser - SonarLint JSON Format

## Overview

This parser handles SonarLint errors copied directly from VS Code's Problems panel in JSON format.

## Usage

When you copy SonarLint errors from your IDE and paste them, the agent will:

1. **Parse the JSON** - Extract issue details (file, rule, line, message)
2. **Group issues** - Organize by file and rule
3. **Research rule** - Look up SonarQube rule documentation
4. **Apply fixes** - Use appropriate sub-agent
5. **Validate** - Run tests and verification

## Example Workflow

### Step 1: Copy Errors from IDE

In VS Code:
1. Open Problems panel (Ctrl+Shift+M)
2. Filter by SonarLint
3. Right-click → Copy
4. Paste in chat

### Step 2: Agent Parses JSON

```typescript
interface IDEError {
  resource: string;        // File path
  owner: string;           // "sonarlint"
  code: string;            // Rule ID (e.g., "typescript:S6772")
  severity: number;        // 4=warning, 8=error
  message: string;         // Error description
  source: string;          // "sonarqube"
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}
```

### Step 3: Agent Groups and Analyzes

```
File: apps/web/src/app/(public)/page.tsx
├── Rule: typescript:S6772 (9 occurrences)
│   ├── Line 110: Ambiguous spacing after previous element span
│   ├── Line 129: Ambiguous spacing after previous element span
│   ├── Line 138: Ambiguous spacing after previous element span
│   └── ... (6 more)
└── Total: 9 issues
```

### Step 4: Research & Fix

The agent will:
1. Research `typescript:S6772` (JSX spacing issue)
2. Read the file
3. Identify the pattern
4. Apply fixes to all 9 occurrences
5. Validate changes

## Supported Error Formats

### VS Code JSON Format (Copy from Problems Panel)
```json
[{
  "resource": "/c:/path/to/file.ts",
  "owner": "sonarlint",
  "code": "typescript:S1541",
  "severity": 8,
  "message": "Reduce cognitive complexity",
  "startLineNumber": 42,
  "endLineNumber": 42
}]
```

### SonarQube API Format
```json
{
  "issues": [{
    "key": "AXyz123",
    "rule": "typescript:S1541",
    "severity": "CRITICAL",
    "component": "apps/web/src/file.ts",
    "line": 42,
    "message": "Reduce cognitive complexity"
  }]
}
```

### Local Report Format (JSON)
```json
{
  "issues": [{
    "engineId": "typescript",
    "ruleId": "S1541",
    "severity": "CRITICAL",
    "primaryLocation": {
      "filePath": "src/file.ts",
      "textRange": { "startLine": 42 },
      "message": "Reduce cognitive complexity"
    }
  }]
}
```

## Severity Mapping

VS Code severity numbers → SonarQube severity:

| VS Code | SonarQube | Description |
|---------|-----------|-------------|
| 8 | BLOCKER/CRITICAL | Must fix |
| 4 | MAJOR | Should fix |
| 2 | MINOR | Consider fixing |
| 1 | INFO | Optional |

## Rule ID Format

SonarQube rules follow the pattern: `<language>:<rule-id>`

Examples:
- `typescript:S1541` - Cognitive complexity
- `typescript:S2077` - SQL injection
- `typescript:S6772` - JSX spacing
- `javascript:S1172` - Unused parameters

## Agent Response

When you paste IDE errors, the agent will respond with:

```markdown
🔍 Parsed IDE Errors

**Summary**:
- Total Issues: 9
- Files Affected: 1
- Unique Rules: 1

**Breakdown**:
- typescript:S6772: 9 occurrences (MAJOR)

**File**: apps/web/src/app/(public)/page.tsx
- Lines: 110, 129, 138, 147, 153, 159, 199, 375, 384

**Rule**: typescript:S6772 - Ambiguous spacing in JSX
**Severity**: MAJOR (4)
**Type**: CODE_SMELL

📚 Research Phase:
Searching for typescript:S6772 documentation...

Found: This rule detects ambiguous spacing in JSX elements that can
lead to unexpected rendering or confusion. Common causes:
- Missing spaces between closing tags
- Inconsistent indentation
- Text nodes with leading/trailing spaces

🔧 Fix Strategy:
- Read file: apps/web/src/app/(public)/page.tsx
- Identify pattern at 9 locations
- Apply consistent JSX spacing
- Format with Prettier
- Validate with ESLint

Would you like me to:
1. Auto-fix all 9 occurrences
2. Show recommendations first
3. Generate detailed report

Please respond with (1), (2), or (3)
```

## Quick Commands for IDE Errors

Once you paste the JSON errors:

```bash
# Auto-fix all pasted errors
fix all

# Show recommendations only
show recommendations

# Fix specific rule only
fix typescript:S6772

# Generate report
generate report

# Fix with deep analysis
fix all --deep-think
```

## Example: Fixing Your Current Errors

Based on your pasted errors, here's what the agent will do:

### Issue Analysis
```
Rule: typescript:S6772
Occurrences: 9
File: apps/web/src/app/(public)/page.tsx
Pattern: Ambiguous spacing after <span> elements
```

### Research
```
typescript:S6772 - JSX spacing rule
- Ensures proper spacing in JSX elements
- Prevents rendering issues
- Improves code readability

Common fixes:
1. Add proper spacing between elements
2. Use {' '} for explicit spaces
3. Ensure consistent formatting
```

### Fix Strategy
```typescript
// BEFORE (Line 110)
<span>Text</span>
<span>More text</span>  // Ambiguous spacing

// AFTER
<span>Text</span>{' '}
<span>More text</span>  // Explicit space
```

### Validation
```
✅ Prettier formatting
✅ ESLint validation
✅ TypeScript compilation
✅ All tests passing
```

## Advanced Features

### Batch Processing by File

If you paste errors from multiple files:

```
Processing 3 files with 25 total issues:

apps/web/src/app/(public)/page.tsx
├── typescript:S6772: 9 issues → Auto-fix
└── Status: ✅ Fixed

apps/api/src/router.ts
├── typescript:S2077: 1 issue → Security Agent
└── Status: ⚠️  Manual review required

packages/domain/src/Lead.ts
├── typescript:S1541: 2 issues → Quality Agent
└── Status: ✅ Fixed
```

### Prioritization

The agent automatically prioritizes:
1. **CRITICAL/BLOCKER** (severity 8) - Fix first
2. **Security vulnerabilities** - Even if MAJOR
3. **Bugs** - Before code smells
4. **High occurrence count** - Pattern fixes

### Incremental Fixing

```
Total: 50 issues across 10 files

Batch 1 (Critical): 5 issues → Fixing...
✅ Completed in 15s

Batch 2 (Security): 8 issues → Fixing...
✅ Completed in 22s

Batch 3 (Code Smells): 37 issues → Fixing...
✅ Completed in 45s

Total time: 82s
Automation rate: 94%
```

## Integration with Skill

This parser is automatically invoked when:
- You paste JSON array starting with `[{`
- JSON contains `"owner": "sonarlint"` or `"source": "sonarqube"`
- JSON has required fields: `resource`, `code`, `message`, `startLineNumber`

The main skill prompt will detect the format and call this parser.

## Error Handling

### Invalid JSON
```
❌ Error: Invalid JSON format
Please copy errors directly from VS Code Problems panel
```

### Missing Required Fields
```
❌ Error: Missing required fields
Expected: resource, code, message, startLineNumber
```

### File Not Found
```
⚠️  Warning: File not found
Path: /c:/taly/intelliFlow-CRM/apps/web/src/app/(public)/page.tsx
Converting to relative path: apps/web/src/app/(public)/page.tsx
```

## Tips for Best Results

1. **Copy all related errors** - Agent can batch fix similar issues
2. **Include full JSON** - Don't truncate the array
3. **One session per file/rule** - For focused fixes
4. **Use auto-fix for trivial issues** - Like formatting, spacing
5. **Request deep-think for complex issues** - Like cognitive complexity

## Next Steps After Pasting

After pasting IDE errors, you can say:

- `"fix all"` - Auto-fix everything safely
- `"fix critical only"` - Focus on severity 8
- `"show me the issues first"` - See analysis before fixing
- `"fix file by file"` - Process one file at a time
- `"deep analysis"` - Enable extended research mode
- `"generate report"` - Get detailed documentation

The agent will understand your intent and proceed accordingly!
