### 1.4 Troca de Tenant (multi-empresa)

**Cenário**: Ana trabalha em duas empresas e precisa alternar entre tenants
rapidamente.

**Especificações Técnicas**:

```yaml
id: FLOW-004
name: Troca de Tenant/Workspace
category: Acesso e Identidade
priority: Medium
sprint: 2

actors:
  - Usuário Multi-tenant
  - Sistema de Autorização
  - Cache de Sessão

pre_conditions:
  - Usuário com acesso a múltiplos tenants
  - Sessão ativa
  - Tenants ativos e configurados

flow_steps:
  1_workspace_selector:
    description: "Acesso ao seletor de workspace"
    ui_location:
      - Header dropdown (ao lado do nome da empresa)
      - Shortcut: Cmd/Ctrl + K
      - URL: /workspaces
    display_info:
      - Current workspace name + logo
      - User role in workspace
      - Last accessed
    artifacts:
      - apps/web/components/workspace/workspace-switcher.tsx
      - apps/web/hooks/use-workspace.ts

  2_list_available_workspaces:
    description: "Listagem de workspaces disponíveis"
    data_displayed:
      - Workspace name
      - Company logo
      - User role
      - Active users count
      - Last activity
      - Subscription status
    sorting:
      - Recent first
      - Alphabetical option
      - Favorites on top
    artifacts:
      - apps/api/src/routers/workspace.router.ts
      - apps/api/src/services/workspace-access.service.ts

  3_validate_access:
    description: "Validação de acesso ao workspace"
    checks:
      - User has active membership
      - Workspace is active
      - Subscription valid
      - No security blocks
      - IP allowlist (if configured)
    rbac_reload:
      - Fetch user role in new workspace
      - Load workspace-specific permissions
      - Apply ABAC rules
    artifacts:
      - apps/api/src/guards/workspace-access.guard.ts
      - apps/api/src/services/rbac.service.ts

  4_switch_context:
    description: "Troca efetiva de contexto"
    technical_steps:
      - Update JWT with new workspace_id
      - Clear current workspace cache
      - Load new workspace config
      - Update all API contexts
      - Refresh UI state
    data_isolation:
      - Verify RLS policies
      - Clear previous data from store
      - Reset filters and searches
    artifacts:
      - apps/api/src/middleware/workspace.middleware.ts
      - apps/web/stores/workspace.store.ts
      - packages/db/src/rls-policies.ts

  5_load_workspace_data:
    description: "Carregamento dos dados do novo workspace"
    initial_load:
      - User preferences
      - Dashboard widgets
      - Recent items
      - Notifications
      - Team members
    performance:
      - Parallel requests
      - Progressive loading
      - Cache warming
    artifacts:
      - apps/web/app/(dashboard)/loading.tsx
      - apps/api/src/services/workspace-bootstrap.service.ts

  6_update_ui_context:
    description: "Atualização da interface"
    ui_updates:
      - Company branding (logo, colors)
      - Navigation based on permissions
      - Dashboard layout
      - Available features
      - Workspace-specific settings
    persistence:
      - Save last workspace
      - Update recent workspaces
      - Sync across devices
    artifacts:
      - apps/web/providers/workspace-provider.tsx
      - apps/web/hooks/use-workspace-theme.ts

edge_cases:
  - workspace_deactivated: "Show message, offer contact admin"
  - permission_revoked: "Graceful degradation, show limited access"
  - subscription_expired: "Read-only mode with upgrade prompt"
  - concurrent_switch: "Lock during switch, queue requests"
  - data_leak_prevention: "Deep clean all caches and states"

technical_artifacts:
  architecture:
    - pattern: "Workspace-isolated databases"
    - rls: "workspace_id in all queries"
    - caching: "Workspace-prefixed keys"

  performance:
    - switch_time_target: <2s
    - cache_strategy: "Lazy load + prefetch"
    - cdn: "Workspace assets cached"

  security:
    - audit: "All workspace switches logged"
    - isolation: "Complete data separation"
    - compliance: "SOC2 Type II certified"

success_metrics:
  - switch_time: <2s (p95)
  - data_isolation: 100%
  - user_satisfaction: >4.5/5
  - security_breaches: 0
```

**Cenário**: Pedro trabalha como consultor em 3 empresas diferentes no CRM.

**Passos Detalhados**:

```yaml
1. Tenant Selector:
  - Dropdown no header mostra empresa atual
  - Click revela lista de tenants disponíveis
  - Badge indica notificações por tenant

2. Processo de Troca:
  - Seleção do novo tenant
  - Loading state (data switch)
  - RLS policies recarregadas
  - Dashboard re-renderizado

3. Contexto Preservado:
  - URL mantém deep link
  - Filtros resetados
  - Tema/preferências por tenant

4. Notificações:
  - Toast: 'Switched to Company XYZ'
  - Audit log da troca
  - Email se primeira vez no tenant
```

**Edge Cases**:

- Tenant suspenso → Mensagem e redirect
- Sem permissão → Lista filtrada
- Dados em draft → Prompt para salvar

**Sistemas**:

- `apps/web/components/tenant-switcher.tsx`
- `apps/api/src/middleware/tenant.middleware.ts`
- Supabase RLS per tenant
