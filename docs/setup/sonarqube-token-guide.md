# SonarQube Token Configuration Guide

## 🔐 Important Security Information

**DO NOT** copy tokens from other projects (like e-commerce-bags) to this
project unless they're for the **exact same SonarQube server instance**.

The tokens you shared are for **different services**:

### Your E-Commerce Bags Tokens:

| Token Type                  | Purpose                | Can Reuse?                       |
| --------------------------- | ---------------------- | -------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`  | Supabase project URL   | ❌ No - Different project        |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role  | ❌ No - Different project        |
| `TWILIO_*`                  | SMS/Phone verification | ❌ No - Different project        |
| `GOOGLE_*`                  | Google OAuth/Maps      | ❌ No - Different project        |
| `STRIPE_*`                  | Payment processing     | ❌ No - Different project        |
| `CLOUDINARY_*`              | Image hosting          | ❌ No - Different project        |
| `SENTRY_*`                  | Error tracking         | ❌ No - Different project        |
| `EMAIL_*`                   | Email service          | ⚠️ Maybe - If same Gmail account |
| `GITHUB_TOKEN`              | GitHub API access      | ⚠️ Maybe - If personal token     |
| `SONAR_TOKEN`               | **Local SonarQube**    | ✅ Yes - If same server          |
| `SONARCLOUD_TOKEN`          | **SonarCloud.io**      | ❌ No - Cloud service            |

## 🎯 For IntelliFlow CRM

### Option 1: Create NEW Local SonarQube Token (Recommended)

This project uses **LOCAL SonarQube Community** running in Docker.

**Steps:**

1. **Start SonarQube server:**

   ```bash
   docker-compose -f docker-compose.sonarqube.yml up -d
   ```

2. **Wait for startup (~2 minutes):**

   ```bash
   docker logs -f intelliflow-sonarqube
   # Wait until you see: "SonarQube is operational"
   ```

3. **Access SonarQube UI:**
   - URL: http://localhost:9000
   - Login: `admin` / `admin`
   - You'll be prompted to change the password

4. **Generate token:**
   - Navigate to: **My Account** → **Security** → **Generate Tokens**
   - Token Name: `intelliflow-crm-local`
   - Type: **Project Analysis Token**
   - Expires: **No expiration** (or 90 days for better security)
   - Click **Generate**
   - **COPY THE TOKEN** (you won't see it again!)

5. **Add to .env.local:**

   ```bash
   # PowerShell
   echo "SONAR_TOKEN=squ_your_new_token_here" >> .env.local

   # Or create/edit .env.local manually
   ```

6. **Verify:**
   ```bash
   # PowerShell
   $env:SONAR_TOKEN = (Get-Content .env.local | Select-String "SONAR_TOKEN").ToString().Split('=')[1]
   sonar-scanner -Dsonar.login=$env:SONAR_TOKEN
   ```

### Option 2: Reuse E-Commerce Bags Token (Only if same server)

**⚠️ ONLY do this if:**

- You're running the **same local SonarQube server** for both projects
- The token `SONAR_TOKEN=squ_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` is from
  `localhost:9000`
- NOT if it's from SonarCloud.io or a different server

**If conditions met:**

```bash
# Copy from e-commerce-bags .env to intelliflow .env.local
echo "SONAR_TOKEN=squ_your_existing_local_sonarqube_token" >> .env.local
```

**However, this is NOT RECOMMENDED because:**

- Tokens should be project-specific for security
- If token is revoked for one project, both break
- Harder to track which project is using what

## 🚫 DO NOT Use These Token Types:

### SonarCloud Token

```
SONARCLOUD_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

This is for **SonarCloud.io** (cloud service), NOT local SonarQube.

### SonarLint Token

```
SONAR_LINT_TOKEN=squ_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

This is for IDE integration, not CI/CD analysis.

## 📋 Token Setup Checklist

- [ ] SonarQube server running (docker-compose)
- [ ] Can access http://localhost:9000
- [ ] Changed default admin password
- [ ] Created new project token: `intelliflow-crm-local`
- [ ] Added `SONAR_TOKEN` to `.env.local`
- [ ] Verified `.env.local` is in `.gitignore`
- [ ] Token works: `pnpm run quality:sonar`

## 🔒 Security Best Practices

1. **Never commit tokens to git**
   - `.env.local` is already in `.gitignore`
   - Use `.env.example` for templates

2. **Use project-specific tokens**
   - Don't share tokens between projects
   - Create separate tokens for each project

3. **Rotate tokens regularly**
   - Set expiration dates (90 days)
   - Revoke old tokens when creating new ones

4. **Use token types appropriately**
   - **Project Analysis Token**: For CI/CD and orchestrator
   - **User Token**: For personal IDE integration (SonarLint)
   - **Global Analysis Token**: Only for admin purposes

5. **Store tokens securely**
   - Use environment variables
   - Or use secret management (Vault, Azure KeyVault, etc.)

## 🆘 Troubleshooting

### "SonarQube server not found"

```bash
# Check if SonarQube is running
docker ps | grep sonarqube

# Check status
curl http://localhost:9000/api/system/status
```

### "Unauthorized 401"

```bash
# Token is invalid or expired
# Create a new token in SonarQube UI
# Update .env.local with new token
```

### "Project not found"

```bash
# First run creates the project automatically
# Or create manually in SonarQube UI:
# Administration → Projects → Create Project
# Project Key: intelliflow-crm
```

## 📚 References

- [SonarQube Setup Guide](../docs/setup/sonarqube-setup.md)
- [Quality Gates Documentation](../docs/quality-gates.md)
- [SonarQube Token Documentation](https://docs.sonarqube.org/latest/user-guide/user-token/)
