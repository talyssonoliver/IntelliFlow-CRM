### 6.1 Account Management & Hierarchy

**Cenario**: Gestor comercial precisa organizar contas de clientes em hierarquias
(matriz/filial), visualizar pipeline por conta, e gerenciar contatos e
oportunidades associados.

**Especificacoes Tecnicas**:

```yaml
id: FLOW-046
name: Account Management & Hierarchy
category: Comercial Core
priority: High
sprint: 5
related_tasks:
  - IFC-103  # Account Aggregate
  - IFC-107  # Account Repository
  - IFC-185  # Account tRPC Router
  - PG-134   # Account List & Detail Pages

actors:
  - Sales Rep
  - Account Manager
  - Sales Manager
  - AI Assistant

pre_conditions:
  - User authenticated with valid tenant session
  - User has permission account:read (list/view) or account:write (create/edit/delete)
  - At least one Account exists in tenant for hierarchy operations
  - Parent account must belong to same tenant for hierarchy linking

flow_steps:
  1_account_list:
    description: 'Account list page with search, filters, and metrics'
    ui_triggers:
      - Navigate to /accounts via sidebar
      - Click "Accounts" in navigation bar
      - Deep link from notification or dashboard
    features:
      search:
        - Full-text search on account name (300ms debounce)
        - Industry filter (dynamic options from database)
        - Owner filter (dynamic user list)
        - Revenue range filter (predefined brackets)
        - Employee count range filter
      stats_cards:
        - Total Accounts (count)
        - Total Revenue (sum, formatted as currency)
        - Average Revenue (mean)
        - Accounts with Opportunities (count with active deals)
      table:
        - Columns: Name, Industry, Revenue, Employees, Owner, Created
        - Sortable by name, revenue, employees, created date
        - Pagination (20 per page)
        - Row click navigates to /accounts/[id]
      bulk_actions:
        - Export selected accounts
        - Bulk delete (with confirmation dialog)
    artifacts:
      - apps/web/src/app/accounts/(list)/page.tsx
      - apps/web/src/app/accounts/(list)/layout.tsx
      - apps/web/src/components/accounts/AccountCard.tsx
      - apps/web/src/components/sidebar/configs/accounts.ts

  2_account_detail:
    description: 'Account detail page with tabbed interface'
    ui_triggers:
      - Click account row in list page
      - Direct URL /accounts/[id]
      - Link from contact or opportunity page
      - Link from hierarchy tree node
    tabs:
      overview:
        - Account name, industry, description
        - Website (clickable link)
        - Employee count, revenue
        - Tier badge (Enterprise/Mid-Market/SMB/Startup)
        - Owner information
        - Created/Updated timestamps
      contacts:
        - Cursor-paginated contact list
        - Status filter (ACTIVE, LEAD, INACTIVE, etc.)
        - Click navigates to /contacts/[contactId]
        - Shows initials avatar, name, email, status badge
        - Load More button for pagination
      opportunities:
        - Cursor-paginated opportunity list
        - Stage filter (PROSPECTING, PROPOSAL, NEGOTIATION, etc.)
        - Summary cards: Total Pipeline, Weighted Value, Count
        - Click navigates to /deals/[opportunityId]
        - Load More button for pagination
      activity:
        - Merged activity feed from contacts and opportunities
        - Chronological timeline
        - Activity types: email, call, meeting, note, deal update
      pipeline:
        - Revenue chart with stage breakdown (horizontal stacked bar)
        - Pipeline trend chart (monthly buckets, vertical bars)
        - Uses formatCurrency for values
      hierarchy:
        - Interactive tree component (see flow step 3)
    actions:
      - Edit account (navigate to edit form)
      - Delete account (disabled if contacts or opportunities exist)
      - Pin to dashboard (via useEntityPin hook)
      - Back to accounts list
    artifacts:
      - apps/web/src/components/accounts/AccountDetail.tsx
      - apps/web/src/components/accounts/AccountContactsList.tsx
      - apps/web/src/components/accounts/AccountOpportunitiesList.tsx
      - apps/web/src/components/accounts/RevenueChart.tsx
      - apps/web/src/app/accounts/[id]/page.tsx

  3_hierarchy_management:
    description: 'Parent/child account hierarchy with tree visualization'
    features:
      tree_view:
        - Recursive tree rendering up to 5 levels deep
        - Current account visually highlighted with (current) label
        - Each node shows: name, tier badge, revenue, contact/opportunity counts
        - Ancestor breadcrumb trail above tree
        - Expand/collapse nodes
      keyboard_navigation:
        - ArrowDown/ArrowUp: move focus between visible nodes
        - ArrowRight: expand node or move to first child
        - ArrowLeft: collapse node or move to parent
        - Enter: navigate to account detail
        - Home/End: jump to first/last visible node
      accessibility:
        - role="tree" on container with aria-label
        - role="treeitem" on each node with aria-expanded
        - Proper tabIndex management for roving focus
      set_parent:
        - "Set Parent Account" button opens picker dialog
        - Search existing accounts by name
        - Select parent from list
        - Validates: no self-reference, no circular hierarchy, max depth 5
        - Calls api.account.setParent mutation
        - Invalidates hierarchy cache on success
      remove_parent:
        - "Remove Parent" button (visible when parent exists)
        - Calls api.account.setParent with null parentAccountId
        - Detaches account from hierarchy
    domain_rules:
      - Account cannot be its own parent
      - Circular hierarchies rejected (A->B->C->A detected)
      - Maximum hierarchy depth: 5 levels
      - Parent must belong to same tenant (cross-tenant rejected)
      - Removing parent is idempotent (no-op if no parent)
    domain_events:
      - AccountHierarchyUpdatedEvent published on setParent/removeParent
    artifacts:
      - apps/web/src/components/accounts/AccountHierarchy.tsx
      - packages/domain/src/crm/account/Account.ts (setParent, removeParent)
      - packages/domain/src/crm/account/AccountEvents.ts (AccountHierarchyUpdatedEvent)
      - packages/domain/src/crm/account/AccountRepository.ts (hierarchy ports)
      - packages/application/src/services/AccountService.ts (getHierarchy, setParent)
      - apps/api/src/modules/account/account.router.ts (getHierarchy, setParent endpoints)

  4_account_tier_segmentation:
    description: 'Automatic tier classification based on revenue'
    tiers:
      ENTERPRISE:
        threshold: '>= 10,000,000'
        color: purple
        label: Enterprise
      MID_MARKET:
        threshold: '>= 1,000,000'
        color: blue
        label: Mid-Market
      SMB:
        threshold: '>= 100,000'
        color: green
        label: SMB
      STARTUP:
        threshold: '> 0'
        color: yellow
        label: Startup
      UNKNOWN:
        threshold: 'null or 0'
        color: slate
        label: Unknown
    usage:
      - Displayed as badge on detail page header
      - Colored dot on list page revenue column
      - Tier filter in sidebar navigation
      - Used by hierarchy tree nodes
    artifacts:
      - apps/web/src/components/accounts/AccountCard.tsx (getAccountTier, TIER_CONFIG)

  5_account_sidebar:
    description: 'Sidebar navigation configuration for accounts module'
    sections:
      views:
        - All Accounts (/accounts)
        - My Accounts (/accounts?view=my)
        - Recently Viewed (/accounts?view=recent)
      tiers:
        - Enterprise (/accounts?tier=enterprise)
        - Mid-Market (/accounts?tier=mid-market)
        - SMB (/accounts?tier=smb)
        - Startup (/accounts?tier=startup)
    artifacts:
      - apps/web/src/components/sidebar/configs/accounts.ts
      - apps/web/src/components/sidebar/configs/index.ts
      - apps/web/src/components/sidebar/icon-reference.ts (MODULE_ICONS.accounts)
      - apps/web/src/components/navigation.tsx (Accounts route)

edge_cases:
  - delete_with_children: 'Cannot delete account that has contacts or opportunities; button disabled with tooltip explanation'
  - circular_hierarchy: 'Service-level cycle detection walks ancestor chain before allowing setParent'
  - deep_hierarchy: 'Max depth 5 enforced; setParent rejected if resulting depth exceeds limit'
  - cross_tenant_parent: 'Both accounts must belong to same tenant; 400 error if cross-tenant'
  - orphaned_children: 'When parent deleted, children parentAccountId set to NULL (ON DELETE SET NULL)'
  - concurrent_hierarchy_edit: 'Optimistic concurrency via Prisma; last write wins'
  - invalid_uuid_in_url: 'UUID validation guard prevents API call; shows Account Not Found immediately'
  - large_hierarchy: 'maxDepth parameter limits recursive query depth; default 5'

technical_artifacts:
  database:
    - column: 'accounts.parentAccountId (TEXT, nullable, self-FK)'
    - index: 'accounts_parentAccountId_idx'
    - constraint: 'accounts_parentAccountId_fkey (ON DELETE SET NULL)'
    - migration: 'packages/db/prisma/migrations/20260208000000_add_account_hierarchy'

  api_endpoints:
    - 'account.list (query, paginated with filters)'
    - 'account.getById (query, single account with counts)'
    - 'account.create (mutation)'
    - 'account.update (mutation)'
    - 'account.delete (mutation)'
    - 'account.getContacts (query, cursor-paginated)'
    - 'account.getOpportunities (query, cursor-paginated with summary)'
    - 'account.getActivity (query, merged timeline)'
    - 'account.getHierarchy (query, ancestors + tree)'
    - 'account.setParent (mutation, with cycle detection)'
    - 'account.stats (query, aggregate metrics)'
    - 'account.filterOptions (query, dynamic filter values)'

  performance:
    - list_load: '<500ms'
    - detail_load: '<300ms'
    - hierarchy_query: '<200ms'
    - set_parent: '<100ms'

  security:
    - tenant_isolation: 'All queries scoped to tenant via RLS and where clause'
    - permission_check: 'tenantProcedure enforces auth + tenant context'
    - cross_tenant_parent: 'Explicitly validated in AccountService.setParent'

success_metrics:
  - account_list_load: '<500ms p95'
  - hierarchy_render: '<200ms for 5-level tree'
  - test_coverage: '>90%'
  - accessibility: 'WCAG 2.1 AA compliance on tree component'
  - zero_cross_tenant: '0 cross-tenant data leaks'
```

**Cenario**: Maria, gestora comercial, precisa visualizar a estrutura
corporativa do cliente TechCorp (matriz + 3 filiais) e o pipeline consolidado.

**Passos Detalhados**:

```yaml
1. Acessar Lista de Contas:
  - Navegar via sidebar "Accounts"
  - Visualizar metricas: 45 contas, R$12M receita total
  - Filtrar por industria "Technology"
  - Ordenar por receita (descrescente)

2. Abrir Conta Detalhe:
  - Clicar em "TechCorp Inc" na lista
  - Ver badge "Enterprise" (receita > 10M)
  - Visualizar 15 contatos, 8 oportunidades associadas

3. Explorar Hierarquia:
  - Clicar aba "Hierarchy"
  - Ver arvore: TechCorp HQ (raiz)
    - TechCorp Brasil (filial)
    - TechCorp UK (filial)
    - TechCorp APAC (filial)
  - Cada no mostra receita e contagem de contatos
  - Navegar via teclado (ArrowDown/ArrowUp)

4. Gerenciar Hierarquia:
  - Clicar "Set Parent Account" na filial nova
  - Buscar "TechCorp HQ" no picker
  - Selecionar como parent
  - Validacao: sem ciclo, profundidade <= 5
  - Arvore atualizada automaticamente

5. Ver Pipeline Consolidado:
  - Clicar aba "Pipeline"
  - Grafico de barras por estagio (Prospecting, Proposal, etc.)
  - Tendencia mensal de pipeline
  - Total: R$2.5M em oportunidades abertas
```

**Edge Cases**:

- Conta sem filiais -> Mostra estado vazio com CTA "Set Parent Account"
- Tentar deletar conta com contatos -> Botao desabilitado + tooltip explicativo
- URL com ID invalido -> Pagina "Account Not Found" sem chamada API

**Sistemas**:

- `apps/web/src/components/accounts/AccountHierarchy.tsx`
- `apps/web/src/components/accounts/AccountDetail.tsx`
- `packages/application/src/services/AccountService.ts`
- `apps/api/src/modules/account/account.router.ts`
- `packages/domain/src/crm/account/Account.ts`
