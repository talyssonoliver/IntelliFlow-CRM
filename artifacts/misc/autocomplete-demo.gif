# Autocomplete Demo GIF Creation Guide

This document describes how to create the `autocomplete-demo.gif` for the SDK documentation.

## Purpose

The autocomplete demo GIF showcases the end-to-end type safety and IntelliSense experience provided by the IntelliFlow tRPC SDK.

## Recording Requirements

### Environment Setup
1. VS Code with TypeScript extension
2. Project with `@intelliflow/api-client` installed
3. TypeScript language server running

### Scenes to Record

#### Scene 1: Router Autocomplete (3 seconds)
```typescript
// Type "trpc." and show autocomplete menu with available routers:
trpc.
// Shows: lead, contact, account, opportunity, task, ticket, analytics, health, system...
```

#### Scene 2: Procedure Autocomplete (3 seconds)
```typescript
// Type "trpc.lead." and show procedures:
trpc.lead.
// Shows: create, getById, list, update, delete, qualify, convert, scoreWithAI, stats...
```

#### Scene 3: Hook Autocomplete (3 seconds)
```typescript
// Type ".useQuery(" and show the method:
trpc.lead.list.useQuery(
// Show: input parameter type appearing
```

#### Scene 4: Input Parameter Autocomplete (4 seconds)
```typescript
// Inside the query input, type and show autocomplete for status:
trpc.lead.list.useQuery({
  status: [
// Shows: 'NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DISQUALIFIED'
```

#### Scene 5: Response Type Inference (3 seconds)
```typescript
// Show data variable with its inferred type:
const { data } = trpc.lead.list.useQuery({ page: 1 });
data.
// Shows: leads, total, page, limit, hasMore
```

#### Scene 6: Error Handling Types (3 seconds)
```typescript
// Show error type with available properties:
const { error } = trpc.lead.create.useMutation();
error?.
// Shows: message, code, data, stack...
```

### Recording Tools

Recommended tools for creating the GIF:

1. **macOS**: [Gifox](https://gifox.app/) or [GIPHY Capture](https://giphy.com/apps/giphycapture)
2. **Windows**: [ScreenToGif](https://www.screentogif.com/) or [ShareX](https://getsharex.com/)
3. **Linux**: [Peek](https://github.com/phw/peek) or [Silentcast](https://github.com/colinkeenan/silentcast)
4. **Cross-platform**: [asciinema](https://asciinema.org/) + [agg](https://github.com/asciinema/agg)

### GIF Specifications

- **Resolution**: 800x400 pixels (optimal for README display)
- **Frame Rate**: 10-15 FPS (balance between smoothness and file size)
- **Duration**: 15-20 seconds total
- **File Size**: Target < 2MB for fast loading
- **Colors**: 256 color palette (standard GIF limitation)

### Recording Tips

1. Use a clean VS Code theme (recommend "One Dark Pro" or "GitHub Dark")
2. Increase font size to 16-18px for readability
3. Slow down typing speed to ~100ms delay between keystrokes
4. Add 500ms pause after each autocomplete menu appears
5. Use Zoom > 100% in VS Code for larger text
6. Disable any distracting extensions or notifications

### Post-Processing

1. Trim the start/end to remove setup time
2. Add a loop for continuous playback
3. Optimize with [gifsicle](https://www.lcdf.org/gifsicle/):
   ```bash
   gifsicle -O3 --colors 256 --lossy=80 input.gif -o autocomplete-demo.gif
   ```

### Output Location

Save the final GIF to:
```
artifacts/misc/autocomplete-demo.gif
```

And reference in README.md:
```markdown
![Autocomplete Demo](../../artifacts/misc/autocomplete-demo.gif)
```

## Status

- [ ] Recording environment prepared
- [ ] All scenes recorded
- [ ] GIF optimized and exported
- [ ] Added to SDK README.md

---

*Last Updated: 2025-12-31*
