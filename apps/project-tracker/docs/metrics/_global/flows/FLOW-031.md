### 9.1 Health Checks e Alertas de Sistema

**Cenário**: Alex precisa relatório complexo de comissões com 20 variáveis.

**Passos Detalhados**:

```yaml
1. Report Wizard:
  - Tipo: Tabular/Summary/Matrix
  - Entities: Deals/Contacts/Activities
  - Time period base
  - Grouping levels

2. Seleção de Campos:
  - Drag campos disponíveis
  - Fórmulas customizadas
  - Aggregations (sum/avg/count)
  - Calculated fields
  - Cross-object fields

3. Filtros Complexos:
  - AND/OR conditions
  - Nested groups
  - Dynamic filters (this month)
  - Parameter prompts
  - Saved filter sets

4. Formatação:
  - Conditional formatting
  - Number formats
  - Sort multi-level
  - Subtotals/Grand totals
  - Page breaks

5. Preview e Save:
  - Live preview (100 rows)
  - Full run estimate
  - Save as template
  - Schedule option
  - Export formats
```

**Edge Cases**:

- Complex query → Optimization suggestions
- Too much data → Pagination/sampling
- Circular reference → Validation error

**Sistemas Envolvidos**:

- `apps/web/app/reports/builder/page.tsx`
- `apps/api/src/reports/query-builder.service.ts`
- `apps/api/src/reports/formatter.service.ts`

**Especificações Técnicas**:

```yaml
id: FLOW-031
name: Health Checks e Monitoramento
category: Observabilidade e Monitoramento
priority: Critical
sprint: 0

actors:
  - Monitoring System
  - Alert Manager
  - On-call Engineer
  - DevOps Team

pre_conditions:
  - Métricas sendo coletadas
  - Thresholds definidos
  - Canais de alerta configurados
  - Runbooks disponíveis

flow_steps:
  1_metric_collection:
    description: "Coleta de métricas"
    system_metrics:
      - CPU utilization
      - Memory usage
      - Disk I/O
      - Network traffic
      - Database connections
    application_metrics:
      - Response times
      - Error rates
      - Throughput
      - Queue depths
      - Business KPIs
    infrastructure_metrics:
      - Server health
      - Container status
      - Load balancer metrics
      - CDN performance
      - Third-party services
    artifacts:
      - apps/api/src/services/metrics-collector.service.ts
      - apps/infra/monitoring/prometheus.yml
      - apps/api/src/models/metric-definition.model.ts

  2_health_assessment:
    description: "Avaliação de saúde"
    synthetic_monitoring:
      - API endpoint checks
      - User journey simulation
      - Database connectivity
      - External service checks
      - Performance benchmarks
    real_user_monitoring:
      - Page load times
      - Error tracking
      - User behavior
      - Conversion funnels
      - Customer satisfaction
    dependency_monitoring:
      - Upstream services
      - Downstream systems
      - Third-party APIs
      - Database clusters
      - Message queues
    artifacts:
      - apps/api/src/services/health-checker.service.ts
      - apps/infra/monitoring/synthetics/
      - apps/web/components/monitoring/health-dashboard.tsx

  3_alert_generation:
    description: "Geração de alertas"
    threshold_monitoring:
      - Static thresholds
      - Dynamic thresholds
      - Anomaly detection
      - Trend analysis
      - Predictive alerting
    alert_escalation:
      - Severity levels
      - Escalation policies
      - On-call rotation
      - Notification channels
      - Acknowledgment tracking
    alert_suppression:
      - Maintenance windows
      - Known issues
      - Scheduled downtime
      - False positive filtering
      - Auto-resolution
    artifacts:
      - apps/api/src/services/alert-manager.service.ts
      - apps/infra/monitoring/alertmanager.yml
      - apps/api/src/models/alert-rule.model.ts

  4_incident_response:
    description: "Resposta a incidentes"
    alert_triage:
      - Alert classification
      - Impact assessment
      - Urgency determination
      - Stakeholder notification
      - Initial investigation
    runbook_execution:
      - Automated remediation
      - Manual procedures
      - Escalation paths
      - Communication updates
      - Resolution tracking
    post_mortem:
      - Root cause analysis
      - Impact documentation
      - Process improvements
      - Knowledge base updates
      - Prevention measures
    artifacts:
      - apps/api/src/services/incident-responder.service.ts
      - apps/infra/runbooks/
      - apps/web/components/incidents/post-mortem-form.tsx

edge_cases:
  - alert_storms: "Alert aggregation and deduplication"
  - monitoring_gaps: "Coverage expansion and redundancy"
  - false_positives: "Alert tuning and suppression"
  - distributed_failures: "Correlation and root cause analysis"
  - capacity_planning: "Predictive scaling and optimization"

technical_artifacts:
  monitoring_stack:
    - metrics: Prometheus + custom exporters
    - logs: ELK stack or Loki
    - traces: Jaeger or Zipkin
    - alerting: Alertmanager
    - visualization: Grafana

  observability:
    - service_mesh: Istio or Linkerd
    - apm: DataDog, New Relic, or custom
    - logging: Structured logging with correlation IDs
    - dashboards: Real-time and historical views

  automation:
    - incident_response: Automated triage and remediation
    - scaling: Auto-scaling based on metrics
    - testing: Synthetic monitoring and chaos engineering

success_metrics:
  - alert_accuracy: >95% true positives
  - mttr: <15min for critical issues
  - system_uptime: >99.9%
  - monitoring_coverage: >98%
```
