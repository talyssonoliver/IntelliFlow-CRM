# Documentation Templates

This directory contains LLM-optimized documentation templates for IntelliFlow
CRM.

## Available Templates

| Template               | Purpose                | Usage                       |
| ---------------------- | ---------------------- | --------------------------- |
| `feature-spec.md`      | Feature specification  | New feature documentation   |
| `api-endpoint.md`      | API endpoint docs      | tRPC router documentation   |
| `domain-entity.md`     | Domain model docs      | DDD aggregate documentation |
| `adr-template.md`      | Architecture decisions | ADR creation                |
| `runbook.md`           | Operations runbook     | Incident response           |
| `chunking-strategy.md` | LLM chunking guide     | RAG optimization            |

## LLM Optimization

All templates follow these principles:

1. **Semantic Structure**: Clear headings, bullet points, tables
2. **Metadata Headers**: YAML frontmatter for classification
3. **Cross-References**: Links to related documents
4. **Chunking-Friendly**: Sections are self-contained
5. **Glossary Terms**: Key terms linked to glossary

## Usage

```bash
# Copy template for new feature
cp docs/templates/feature-spec.md docs/features/my-feature.md
```
