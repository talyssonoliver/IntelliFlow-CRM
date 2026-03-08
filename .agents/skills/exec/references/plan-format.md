# Plan File Format for API Parsing

The validation-summary API parses plan files with specific regex patterns. Plans MUST follow these formatting rules.

## File Sections

**MUST use plural block format:**
```markdown
**Files to Create:**
- `path/to/file.ts`
- `path/to/other.ts`

**Files to Modify:**
- `path/to/existing.ts`
```

**NOT** singular inline format like `**File to Create:** \`path\`` — the API regex won't match.

## Checkboxes

Standard markdown checkboxes:
```markdown
- [ ] Unchecked item
- [x] Checked item
```

Regex: `/^(\s*)-\s*\[([ xX])\]\s*(.+)$/`

Completion gate: checkboxes must be 100% (binary — no WARN range), all listed artifacts must exist on disk.
**Scope**: ALL checkboxes count — including Preflight Checks section, not just execution steps.

## CRLF Warning

JS `.` does NOT match `\r`. The validation-summary API strips `\r` before parsing.

## MATOP Execution Dirs

API accepts both formats:
- `YYYYMMDD-HHMMSS`
- `TASKID-validation-YYYYMMDD-HHMMSS`
