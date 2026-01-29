### 1.2 Gestão de Usuário e Equipes (RBAC/ABAC)

**Cenário**: Admin Maria precisa criar novo usuário vendedor com permissões
específicas.

**Especificações Técnicas**:

```yaml
id: FLOW-002
name: Gestão de Usuários e Permissões
category: Acesso e Identidade
priority: High
sprint: 1

actors:
  - Admin/Manager
  - Novo Usuário
  - Sistema RBAC

pre_conditions:
  - Admin possui permissão user:manage
  - Licenças disponíveis
  - Email do novo usuário válido

flow_steps:
  1_access_user_management:
    description: 'Admin acessa gestão de usuários'
    navigation: Settings > Users & Teams
    permissions_required:
      - organization:admin OR
      - user:manage
    artifacts:
      - apps/web/app/settings/users/page.tsx
      - apps/api/src/guards/permission.guard.ts

  2_create_user:
    description: 'Criação de novo usuário'
    fields:
      - email: required, unique
      - name: required
      - role: required (dropdown)
      - teams: optional (multi-select)
      - manager: optional (user lookup)
    validations:
      - Email não existe no sistema
      - Role válida para o plano
      - Teams existem e ativos
    artifacts:
      - apps/web/components/users/create-user-form.tsx
      - apps/api/src/routers/user.router.ts
      - packages/domain/src/users/user.aggregate.ts

  3_define_permissions:
    description: 'Configuração de permissões'
    rbac_model:
      roles:
        - Admin: all permissions
        - Manager: team + reports
        - Sales: contacts + deals
        - Support: tickets + kb
        - Viewer: read-only
    abac_rules:
      - Own team only
      - Regional restriction
      - Deal size limit
      - Time-based access
    artifacts:
      - apps/api/src/rbac/roles.config.ts
      - apps/api/src/abac/policies.ts
      - packages/db/prisma/seed/permissions.ts

  4_invite_user:
    description: 'Envio de convite'
    process:
      - Generate secure invite token
      - Send email with magic link
      - Set expiration (7 days)
      - Track invite status
    email_template:
      - Welcome message
      - CRM access link
      - Onboarding resources
      - Support contact
    artifacts:
      - apps/api/src/services/invite.service.ts
      - apps/api/src/templates/invite-email.tsx
      - packages/email/src/providers/sendgrid.ts

  5_user_activation:
    description: 'Ativação pelo usuário'
    steps:
      - Click magic link
      - Set password
      - Configure MFA
      - Accept terms
      - Complete profile
    validations:
      - Token not expired
      - Email matches invite
      - Password meets policy
      - MFA properly configured
    artifacts:
      - apps/web/app/invite/[token]/page.tsx
      - apps/api/src/services/activation.service.ts

  6_team_assignment:
    description: 'Atribuição a equipes'
    process:
      - Add to selected teams
      - Inherit team permissions
      - Notify team members
      - Update org chart
    notifications:
      - Email to team lead
      - Slack/Teams message
      - Dashboard notification
    artifacts:
      - apps/api/src/services/team.service.ts
      - apps/api/src/events/user-joined-team.event.ts

edge_cases:
  - duplicate_email: 'Show existing user, suggest password reset'
  - license_exceeded: 'Prompt upgrade or deactivate user'
  - invalid_role_combination: 'Validation error with explanation'
  - invite_expired: 'Allow resend with new token'
  - permission_conflict: 'ABAC takes precedence over RBAC'

technical_artifacts:
  database:
    - tables: users, roles, permissions, user_roles, team_members
    - views: user_permissions_matrix, effective_permissions

  caching:
    - redis_keys: user:{id}:permissions, team:{id}:members
    - ttl: 5 minutes

  audit:
    - events: user_created, role_assigned, permission_changed
    - retention: 2 years

success_metrics:
  - invite_acceptance_rate: >90
  - time_to_activate: <24h
  - permission_accuracy: 100%
  - audit_compliance: 100%
```

**Cenário**: Admin Maria precisa criar novo usuário vendedor com permissões
específicas.

**Passos Detalhados**:

```yaml
1. Acesso ao Admin Panel:
  - Navigate: Settings → Users & Teams
  - Verificação de role ADMIN
  - Lista usuários com DataTable

2. Criação de Usuário:
  - Click "New User"
  - Form: Nome, Email, Departamento
  - Role selection: Sales Rep
  - Permissions: Read Contacts, CRUD Deals
  - Team assignment: Sales Team North

3. Configuração ABAC:
  - Attributes: region=north, max_deal_value=100k
  - Data access: only team contacts
  - Feature flags: ai_scoring=true

4. Convite e Ativação:
  - Email com link temporário (24h)
  - Usuário define senha inicial
  - Força troca no primeiro login
```

**Edge Cases**:

- Email já existe → Erro com sugestão de reset
- Sem licenças disponíveis → Upgrade prompt
- Permissão conflitante → Warning com explicação

**Sistemas**:

- `apps/web/app/settings/users/page.tsx`
- `apps/api/src/rbac/rbac.service.ts`
- `packages/db/prisma/schema-rbac.prisma`
