# SonarQube Fix — MCP Server Integration

If MCP servers are available, use them for enhanced analysis:

## SonarQube MCP

```javascript
// Fetch issues
mcp_exec({
  name: "sonarqube_get_issues",
  arguments: {
    project: "intelliflow-crm",
    severity: ["BLOCKER", "CRITICAL"],
    resolved: false
  }
})

// Get rule details
mcp_exec({
  name: "sonarqube_get_rule",
  arguments: {
    rule_key: "typescript:S1541"
  }
})
```

## Web Search MCP

```javascript
mcp_exec({
  name: "web_search",
  arguments: {
    query: "typescript cognitive complexity best practices",
    limit: 10
  }
})
```

## Fallback (No MCP)

If MCP servers are unavailable:
- Parse local reports at `artifacts/reports/sonarqube/issues.json`
- Use `target/sonar/report-task.txt` as alternative
- Use built-in WebSearch tool for research
