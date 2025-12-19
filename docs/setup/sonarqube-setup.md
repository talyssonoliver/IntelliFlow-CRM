# SonarQube Setup Guide - IntelliFlow CRM

## Quick Start

### 1. Start SonarQube Server

```bash
# Start SonarQube and PostgreSQL
docker-compose -f docker-compose.sonarqube.yml up -d

# Wait for startup (takes ~2 minutes)
docker logs -f intelliflow-sonarqube

# Access UI: http://localhost:9000
# Default credentials: admin/admin
```

### 2. Initial Configuration

1. **Change Default Password**
   - Login with `admin/admin`
   - Follow prompt to change password

2. **Create Project Token**

   ```bash
   # Navigate to: My Account > Security > Generate Tokens
   # Token Name: intelliflow-crm-cli
   # Type: Project Analysis Token
   # Save token to environment
   ```

3. **Set Environment Variable**

   ```powershell
   # Windows PowerShell
   $env:SONAR_TOKEN="your-token-here"

   # Or add to .env file (gitignored)
   echo "SONAR_TOKEN=your-token-here" >> .env.local
   ```

### 3. Run Analysis

```bash
# Install SonarScanner (one-time)
npm install -g sonarqube-scanner

# Run analysis
sonar-scanner

# Or via orchestrator
./apps/project-tracker/docs/metrics/orchestrator.sh validate ENV-014-AI
```

## Integration with Orchestrator

The orchestrator automatically runs SonarQube analysis when:

- Task has `sonarqube_scan: true` in validation.yaml
- `SONAR_TOKEN` environment variable is set
- SonarQube server is accessible at `http://localhost:9000`

### Validation Example

```yaml
ENV-014-AI:
  validation_commands:
    - command: 'sonar-scanner -Dsonar.qualitygate.wait=true'
      description: 'SonarQube static analysis'
      type: auto
      required: true
  quality_gates:
    - metric: 'coverage'
      operator: '>='
      threshold: 80
    - metric: 'security_rating'
      operator: '<='
      threshold: 'A'
```

## Quality Gates

### Default Quality Gate

- **Code Coverage**: ≥ 80%
- **Duplicated Lines**: ≤ 3%
- **Maintainability Rating**: A
- **Reliability Rating**: A
- **Security Rating**: A
- **Security Hotspots**: 0

### Custom Quality Gates

1. Navigate to: **Quality Gates** > **Create**
2. Set conditions for your project
3. Assign to project: **Project Settings** > **Quality Gate**

## CI/CD Integration

### GitHub Actions

```yaml
- name: SonarQube Scan
  uses: sonarsource/sonarqube-scan-action@master
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
    SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}
```

### GitLab CI

```yaml
sonarqube:
  image: sonarsource/sonar-scanner-cli:latest
  script:
    - sonar-scanner -Dsonar.qualitygate.wait=true
  only:
    - merge_requests
    - main
```

## Troubleshooting

### SonarQube Won't Start

```bash
# Check logs
docker logs intelliflow-sonarqube

# Common fix: Increase VM max map count (Linux/WSL)
sudo sysctl -w vm.max_map_count=262144

# Make permanent
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

### Analysis Fails

```bash
# Verify token
echo $SONAR_TOKEN

# Check connectivity
curl http://localhost:9000/api/system/status

# Run with debug
sonar-scanner -X
```

### Quality Gate Failed

1. Review issues in UI: http://localhost:9000
2. Fix code issues
3. Re-run analysis
4. Check quality gate status

## Best Practices

1. **Run analysis locally before committing**

   ```bash
   pnpm test:coverage && sonar-scanner
   ```

2. **Integrate into pre-commit hooks**

   ```json
   {
     "husky": {
       "hooks": {
         "pre-push": "sonar-scanner -Dsonar.qualitygate.wait=true"
       }
     }
   }
   ```

3. **Monitor technical debt regularly**
   - Check dashboard weekly
   - Prioritize critical issues
   - Track debt trend over time

4. **Configure IDE plugins**
   - **VS Code**: SonarLint extension
   - **IntelliJ**: SonarLint plugin
   - Enable connected mode with local SonarQube

## References

- [SonarQube Documentation](https://docs.sonarqube.org/)
- [SonarScanner CLI](https://docs.sonarqube.org/latest/analysis/scan/sonarscanner/)
- [Quality Gates](https://docs.sonarqube.org/latest/user-guide/quality-gates/)
