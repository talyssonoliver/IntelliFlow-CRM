# Cost Optimization Actions Guide
## IntelliFlow CRM FinOps Playbook

**Task ID:** IFC-055
**Owner:** CFO + PM (STOA-Leadership)
**Last Updated:** 2025-12-28
**Version:** 1.0.0

---

## Executive Summary

This document outlines cost optimization strategies for IntelliFlow CRM infrastructure and services. Following these actions has resulted in **66% underspend** compared to budget, saving approximately $83/week.

**Current Status:**
- Weekly Budget: $125
- Actual Spend: $42.15
- Savings Rate: 66.3%

---

## 1. Active Optimizations

### 1.1 Ollama Local LLM (ACTIVE)

**Savings: $35/week | $1,820/year**

**Implementation:**
- Ollama installed for local development and testing
- Models: Llama 3.1, Mistral for general tasks
- OpenAI reserved for production and accuracy-critical operations

**Configuration:**
```yaml
# docker-compose.ollama.yml
services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
```

**Best Practices:**
- Use Ollama for: Development, testing, demos, non-critical scoring
- Use OpenAI for: Production scoring, customer-facing AI, complex reasoning
- Switch threshold: Confidence score < 0.8 → escalate to OpenAI

---

### 1.2 Supabase Free Tier Optimization (ACTIVE)

**Savings: $25/week | $1,300/year**

**Current Usage:**
- Storage: 25MB / 500MB (5%)
- Bandwidth: 0.3GB / 2GB (15%)
- MAU: 10 / 50,000 (0.02%)

**Optimization Tactics:**

| Tactic | Description | Impact |
|--------|-------------|--------|
| Soft Deletes | Archive instead of hard delete | Reduce storage growth |
| Image Compression | Compress before upload | -60% storage |
| Query Optimization | Minimize data transfer | -30% bandwidth |
| Connection Pooling | Reuse database connections | Stable connections |

**Upgrade Trigger Points:**
- Storage > 400MB (80%)
- Bandwidth > 1.6GB (80%)
- Need daily backups for customer data
- First paying customer acquired

---

### 1.3 Vercel Hobby Tier (ACTIVE)

**Savings: $20/week | $1,040/year**

**Current Usage:**
- Bandwidth: 2.5GB / 100GB (2.5%)
- Build Minutes: Within limits
- Functions: Hobby tier adequate

**Optimization Tactics:**
- ISR (Incremental Static Regeneration) for dynamic content
- Edge caching for API responses
- Image optimization via next/image
- Bundle analysis to reduce JavaScript size

**Upgrade Trigger Points:**
- Need custom domains with SSL
- Require preview deployments for team
- Analytics needed

---

### 1.4 Turborepo Build Caching (ACTIVE)

**Savings: $15/week | $780/year**

**Impact:**
- Build time: 180s → 35s (81% reduction)
- CI minutes: 60% reduction
- Developer time: 2hr/week saved

**Configuration:**
```json
// turbo.json
{
  "pipeline": {
    "build": {
      "cache": true,
      "outputs": [".next/**", "dist/**"]
    },
    "test": {
      "cache": true,
      "outputs": ["coverage/**"]
    }
  }
}
```

---

## 2. Planned Optimizations

### 2.1 OpenAI Prompt Caching (PLANNED)

**Estimated Savings: $8/week | $416/year**

**Implementation Plan:**
1. Implement semantic caching for common queries
2. Use Redis/Upstash for cache storage
3. Cache hit target: 30% of requests

**Code Pattern:**
```typescript
// Planned implementation
const cachedResponse = await promptCache.get(semanticKey);
if (cachedResponse && confidence > 0.95) {
  return cachedResponse;
}
const response = await openai.complete(prompt);
await promptCache.set(semanticKey, response, { ttl: 3600 });
```

**Priority:** High
**Effort:** Low
**Timeline:** Sprint 9

---

### 2.2 Embedding Deduplication (BACKLOG)

**Estimated Savings: $3/week | $156/year**

**Implementation Plan:**
1. Hash content before generating embeddings
2. Check for existing embeddings with same hash
3. Reuse embeddings for duplicate content

**Priority:** Medium
**Effort:** Medium
**Timeline:** Sprint 12

---

### 2.3 CDN Edge Caching (EVALUATE)

**Estimated Savings: $2/week | $104/year**

**Evaluation Criteria:**
- Current bandwidth usage
- Geographic distribution of users
- Cache hit ratio potential

**Options:**
- Cloudflare (Free tier available)
- Vercel Edge Network (included)
- Fastly (if scale required)

---

## 3. Cost Control Procedures

### 3.1 Daily Monitoring

**Dashboard Checks:**
- [ ] OpenAI API spend (target: <$15/day)
- [ ] Railway compute hours
- [ ] Supabase bandwidth
- [ ] Error rates (errors cost money)

**Automated Alerts:**
- 80% of daily OpenAI budget → Slack notification
- 100% of daily OpenAI budget → Auto-switch to Ollama
- Any service degradation → PagerDuty alert

---

### 3.2 Weekly Review Process

**Every Monday:**
1. Generate weekly cost report (`artifacts/reports/weekly-cost-report.csv`)
2. Compare actual vs budget
3. Identify cost anomalies
4. Update projections
5. Review optimization opportunities

**Review Checklist:**
- [ ] All services within budget?
- [ ] Any unexpected charges?
- [ ] Optimization opportunities identified?
- [ ] Forecast updated?
- [ ] Actions documented?

---

### 3.3 Monthly Actions

**First of Month:**
1. Reconcile invoices with tracked spend
2. Update cost projections for next 3 months
3. Review tier usage vs limits
4. Evaluate upgrade/downgrade opportunities
5. Submit monthly FinOps report

---

## 4. Emergency Cost Reduction

### 4.1 Immediate Actions (If Over Budget)

**Tier 1: Soft Measures**
- Switch all dev/test to Ollama
- Enable aggressive caching
- Reduce AI feature usage temporarily
- Defer non-critical background jobs

**Tier 2: Moderate Measures**
- Disable optional AI features
- Reduce data retention period
- Scale down non-production environments
- Implement stricter rate limiting

**Tier 3: Severe Measures**
- AI features in degraded mode (cached responses only)
- Scale to minimum infrastructure
- Disable non-essential monitoring
- Emergency stakeholder notification

---

### 4.2 Escalation Matrix

| Budget Variance | Action | Escalate To |
|-----------------|--------|-------------|
| 0-10% over | Monitor | PM |
| 10-20% over | Optimize | PM + Tech Lead |
| 20-50% over | Reduce | CFO + CTO |
| >50% over | Emergency | CEO + All Leads |

---

## 5. ROI Tracking

### 5.1 Optimization ROI

| Optimization | Investment | Annual Savings | ROI |
|--------------|------------|----------------|-----|
| Ollama Setup | 4 hours | $1,820 | 45,500% |
| Supabase Free | 0 hours | $1,300 | Infinite |
| Vercel Hobby | 0 hours | $1,040 | Infinite |
| Turborepo | 2 hours | $780 | 19,500% |
| **Total** | **6 hours** | **$4,940** | **N/A** |

### 5.2 Cost per Feature

| Feature | Monthly Cost | Users Impacted | Cost/User |
|---------|--------------|----------------|-----------|
| AI Lead Scoring | $80 | 100% | $0.80 |
| Real-time Updates | $5 | 50% | $0.10 |
| Document Storage | $0 | 30% | $0.00 |
| Analytics | $5 | 80% | $0.06 |

---

## 6. Vendor Management

### 6.1 Current Vendors

| Vendor | Contract | Renewal | Negotiation Notes |
|--------|----------|---------|-------------------|
| Supabase | Free tier | N/A | Upgrade when needed |
| Vercel | Hobby | Monthly | Evaluate Pro quarterly |
| Railway | Starter | Monthly | Usage-based pricing |
| OpenAI | Pay-as-you-go | N/A | Volume discounts at $1K+ |

### 6.2 Alternative Evaluation

**AI/LLM Alternatives:**
- Anthropic Claude (competitive pricing)
- Google Gemini (enterprise discounts)
- Azure OpenAI (if Azure ecosystem)
- Self-hosted models (Ollama, vLLM)

**Database Alternatives:**
- PlanetScale (MySQL, good free tier)
- Neon (PostgreSQL, serverless)
- CockroachDB (if global scale needed)

---

## 7. Compliance & Audit

### 7.1 FinOps Audit Trail

All cost decisions are documented in:
- `artifacts/reports/weekly-cost-report.csv` - Weekly tracking
- `artifacts/misc/invoice-tracker.csv` - Invoice reconciliation
- `artifacts/misc/usage-alerts-config.yaml` - Alert configuration
- Git commit history for configuration changes

### 7.2 Approval Requirements

| Spend Level | Approval Required |
|-------------|-------------------|
| <$50/week | Auto-approved (within budget) |
| $50-$100/week | PM approval |
| $100-$200/week | CFO approval |
| >$200/week | CEO + CFO approval |

---

## Appendices

### A. Related Documents

- Budget Approval: `artifacts/reports/budget-approval.md`
- Cost Projection: `artifacts/reports/cost-projection.json`
- ROI Projection: `artifacts/reports/roi-projection.md`
- Weekly Cost Report: `artifacts/reports/weekly-cost-report.csv`
- Usage Alerts: `artifacts/misc/usage-alerts-config.yaml`
- Invoice Tracker: `artifacts/misc/invoice-tracker.csv`

### B. Contact Information

| Role | Contact | Responsibility |
|------|---------|----------------|
| CFO | cfo@intelliflow.io | Budget approval |
| PM | pm@intelliflow.io | Weekly tracking |
| Tech Lead | tech-lead@intelliflow.io | Technical optimization |
| DevOps | devops@intelliflow.io | Infrastructure changes |

### C. Change Log

| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2025-12-28 | 1.0.0 | Initial version | STOA-Leadership |

---

**Document Version:** 1.0.0
**Classification:** Internal - Financial
**Review Frequency:** Monthly
