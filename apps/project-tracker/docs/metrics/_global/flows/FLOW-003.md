### 1.3 Recuperação de Senha / Reset via Email/Authenticator

**Cenário**: Carlos esqueceu senha e precisa recuperar acesso urgente.

**Especificações Técnicas**:

```yaml
id: FLOW-003
name: Recuperação de Senha
category: Acesso e Identidade
priority: High
sprint: 1

actors:
  - Usuário (esqueceu senha)
  - Sistema de Email
  - Sistema de Autenticação

pre_conditions:
  - Email cadastrado no sistema
  - Conta ativa
  - Email service operacional

flow_steps:
  1_request_reset:
    description: "Solicitação de reset"
    interface:
      - Link "Forgot password?" na tela de login
      - Modal com campo de email
      - Captcha (se muitas tentativas)
    validations:
      - Email format valid
      - Rate limiting (3 per hour)
      - Account exists and active
    artifacts:
      - apps/web/components/auth/forgot-password.tsx
      - apps/api/src/routers/auth.router.ts

  2_generate_token:
    description: "Geração de token seguro"
    security:
      - Cryptographically secure random
      - One-time use
      - 15 minutes expiration
      - Tied to user + timestamp
    storage:
      - Redis with TTL
      - Encrypted in database
    artifacts:
      - apps/api/src/services/reset-token.service.ts
      - packages/crypto/src/token.utils.ts

  3_send_email:
    description: "Envio do email"
    email_content:
      - Subject: "Reset your IntelliFlow password"
      - Personalized greeting
      - Reset link with token
      - Expiration warning
      - Security tips
      - "Not you?" warning
    delivery:
      - Primary: SendGrid
      - Fallback: AWS SES
      - Track: open, click
    artifacts:
      - apps/api/src/templates/password-reset.tsx
      - apps/api/src/services/email.service.ts

  4_validate_token:
    description: "Validação do token"
    user_flow:
      - Click link in email
      - Redirect to reset page
      - Validate token server-side
      - Show password form or error
    validations:
      - Token exists
      - Not expired
      - Not used
      - Matches user
    artifacts:
      - apps/web/app/reset-password/[token]/page.tsx
      - apps/api/src/middleware/reset-token.middleware.ts

  5_set_new_password:
    description: "Definição de nova senha"
    requirements:
      - Min 12 characters
      - Upper + lower + number + special
      - Not in breach database
      - Not similar to email/name
      - Confirm password match
    additional_security:
      - Invalidate all sessions
      - Require MFA re-enrollment
      - Send confirmation email
    artifacts:
      - apps/web/components/auth/new-password-form.tsx
      - apps/api/src/validators/password.validator.ts
      - apps/api/src/services/password.service.ts

  6_post_reset_actions:
    description: "Ações pós-reset"
    security_measures:
      - Mark token as used
      - Log security event
      - Notify user via email
      - Flag for monitoring
    user_experience:
      - Success message
      - Redirect to login
      - Pre-fill email
      - Show MFA setup if needed
    artifacts:
      - apps/api/src/events/password-reset.event.ts
      - apps/api/src/services/security-alert.service.ts

edge_cases:
  - email_not_found: "Generic message to prevent enumeration"
  - token_expired: "Show expiration message, allow new request"
  - token_already_used: "Security warning, force new request"
  - multiple_reset_attempts: "Lock after 5 attempts in 1 hour"
  - email_delivery_failure: "Log, retry, show alternative support"

technical_artifacts:
  security:
    - password_hashing: Argon2id
    - token_storage: Redis with encryption
    - breach_check: HaveIBeenPwned API

  monitoring:
    - metrics: reset_requests, success_rate, token_expiration
    - alerts: unusual_reset_volume, repeated_failures

  compliance:
    - logs: all_reset_attempts, ip_addresses, user_agents
    - retention: 90 days

success_metrics:
  - reset_completion_rate: >80%
  - time_to_reset: <5 minutes
  - email_delivery_rate: >99%
  - security_incidents: 0
```

**Cenário**: Carlos esqueceu senha e precisa recuperar acesso urgente.

**Passos Detalhados**:

```yaml
1. Tela de Login:
  - Click "Forgot Password?"
  - Input: email corporativo
  - reCAPTCHA validation

2. Verificação de Identidade:
  - Email encontrado no sistema
  - Opções: Email ou SMS
  - Código 6 dígitos enviado

3. Reset de Senha:
  - Link válido por 1 hora
  - Nova senha: min 12 chars, complexidade
  - Confirmação de senha
  - Invalidação de sessões antigas

4. Confirmação:
  - Email de confirmação
  - Audit log registrado
  - Login com nova senha
```

**Edge Cases**:

- Email não encontrado → Mensagem genérica (segurança)
- Link expirado → Novo processo required
- Senha comprometida → Force 2FA setup

**Sistemas**:

- `apps/web/app/auth/reset-password/page.tsx`
- `apps/api/src/auth/password-reset.service.ts`
- Supabase Auth APIs
