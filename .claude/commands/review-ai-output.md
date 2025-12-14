# Review AI Output Command

Review AI-generated code for quality, security, and adherence to standards.

## Usage
```
/review-ai-output [file-or-diff] [--security] [--performance]
```

## Arguments
- `file-or-diff`: File path or git diff to review
- `--security`: Focus on security vulnerabilities
- `--performance`: Include performance analysis

## Review Checklist

### Type Safety
- [ ] No `any` types (TypeScript strict mode)
- [ ] Proper Zod validation for inputs
- [ ] tRPC type inference working
- [ ] Prisma types correctly used

### Domain Rules
- [ ] Domain logic in domain layer only
- [ ] No infrastructure deps in domain
- [ ] Value objects for business rules
- [ ] Domain events properly emitted

### Security
- [ ] Input validation present
- [ ] No SQL injection vulnerabilities
- [ ] XSS prevention measures
- [ ] Proper authentication checks
- [ ] Secrets not hardcoded

### Performance
- [ ] Efficient database queries
- [ ] Proper indexing used
- [ ] No N+1 query patterns
- [ ] Caching considered

### Testing
- [ ] Unit tests included
- [ ] Edge cases covered
- [ ] >90% coverage achieved
- [ ] Integration tests if needed

## Output

```markdown
## AI Code Review Summary

### Score: 8/10

### Issues Found
1. [SECURITY] Missing input validation on line 45
2. [TYPE] Using `any` on line 23
3. [PERF] N+1 query pattern detected

### Recommendations
- Add Zod schema for request body
- Replace `any` with proper interface
- Use `include` for eager loading

### Approved for Merge: NO (fix issues first)
```

## Example
```bash
# Review specific file
/review-ai-output apps/api/src/modules/lead/lead.router.ts

# Review git diff with security focus
/review-ai-output HEAD~1 --security
```
