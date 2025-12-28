### 6.2 Relatórios Customizáveis (drag-and-drop builder)

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
id: FLOW-023
name: Construtor de Relatórios
category: Analytics e Insights
priority: High
sprint: 5

actors:
  - Analista de Dados
  - Sistema de Reports
  - Data Sources
  - Visualization Engine

pre_conditions:
  - Permissões de relatório
  - Dados disponíveis
  - Builder acessível
  - Templates configurados

flow_steps:
  1_builder_access:
    description: "Acesso ao construtor"
    interface_initialization:
      - Canvas loading
      - Component library
      - Data source connection
      - Template selection
      - User preferences
    drag_drop_setup:
      - Component palette
      - Drop zones
      - Snap guidelines
      - Validation rules
      - Undo/redo stack
    collaboration_features:
      - Shared workspaces
      - Version control
      - Comment system
      - Access management
      - Change tracking
    artifacts:
      - apps/web/components/reports/builder-canvas.tsx
      - apps/web/components/reports/component-palette.tsx
      - apps/api/src/services/report-builder.service.ts

  2_data_connection:
    description: "Conexão de dados"
    source_selection:
      - Database tables
      - API endpoints
      - External systems
      - Calculated metrics
      - Real-time streams
    query_builder:
      - Visual query design
      - Join operations
      - Filter application
      - Aggregation functions
      - Data transformation
    data_validation:
      - Schema validation
      - Data quality checks
      - Performance testing
      - Error handling
      - Preview generation
    artifacts:
      - apps/api/src/services/data-connector.service.ts
      - apps/web/components/reports/query-builder.tsx
      - apps/api/src/validators/data-connection.validator.ts

  3_visualization_creation:
    description: "Criação de visualizações"
    chart_types:
      - Bar/column charts
      - Line/area charts
      - Pie/donut charts
      - Scatter plots
      - Heat maps
      - Custom visualizations
    customization_options:
      - Color schemes
      - Axis configuration
      - Legend placement
      - Interactivity
      - Responsive design
    advanced_features:
      - Drill-down capability
      - Cross-filtering
      - Animation effects
      - Conditional formatting
      - Reference lines
    artifacts:
      - apps/web/components/charts/chart-editor.tsx
      - apps/api/src/services/visualization-engine.service.ts
      - apps/web/components/reports/style-panel.tsx

  4_report_publishing:
    description: "Publicação do relatório"
    sharing_options:
      - Internal sharing
      - External access
      - Scheduled delivery
      - API embedding
      - Public links
    access_control:
      - Permission management
      - Row-level security
      - Data masking
      - Audit logging
      - Compliance checks
    automation_setup:
      - Refresh schedules
      - Alert conditions
      - Distribution lists
      - Format options
      - Archival policies
    artifacts:
      - apps/api/src/services/report-publisher.service.ts
      - apps/web/components/reports/sharing-dialog.tsx
      - apps/api/src/models/report-access.model.ts

edge_cases:
  - complex_queries: "Query optimization and caching"
  - large_datasets: "Pagination and virtualization"
  - real_time_data: "Streaming and incremental updates"
  - user_errors: "Validation and guidance"
  - performance_issues: "Optimization recommendations"

technical_artifacts:
  architecture:
    - builder: React-based drag-and-drop
    - engine: D3.js + custom visualizations
    - data_layer: GraphQL + REST APIs
    - storage: Versioned report definitions

  performance:
    - builder_load: <2s
    - query_execution: <10s for complex reports
    - rendering_speed: <1s for standard charts
    - concurrent_builders: 100+

  extensibility:
    - custom_components: Plugin architecture
    - data_sources: Connector framework
    - visualizations: Chart library extensions

success_metrics:
  - report_creation_time: <15min average
  - user_satisfaction: >4.5/5
  - report_accuracy: >98%
  - sharing_adoption: >70%
```
