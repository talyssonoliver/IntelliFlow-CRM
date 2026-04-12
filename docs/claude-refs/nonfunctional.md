# Non-Functional Requirements

## Performance Targets

- **API Response Time**: p95 < 100ms, p99 < 200ms
- **Frontend Load Time**: First Contentful Paint < 1s
- **AI Scoring**: < 2s per lead
- **Database Queries**: < 20ms for simple queries
- **Build Time**: < 3 minutes for full monorepo
- **Test Suite**: < 15 minutes in CI
- **Lighthouse**: All scores >= 90 (production build)
- **Core Web Vitals**: FCP <1s, LCP <2.5s, CLS <0.1, TBT <300ms, FID <100ms
- **Resource Budgets**: JS <300KB, CSS <50KB, Total <1MB, Server response <200ms

## Security Considerations

- **Secrets Management**: Environment variables only, never commit secrets
- **RLS**: Row Level Security enabled in Supabase for all tables
- **Input Validation**: All inputs validated with Zod before processing
- **OWASP Top 10**: Regularly scanned with ZAP
- **AI Security**: All AI outputs sanitized before rendering
- **Rate Limiting**: Upstash Redis for API rate limiting

## Monitoring & Observability

- **Traces**: OpenTelemetry traces all requests
- **Metrics**: Custom metrics via Prometheus
- **Logs**: Structured logging with correlation IDs
- **Dashboards**: Grafana dashboards for key metrics
- **Alerts**: PagerDuty integration for incidents

### Key Metrics Tracked

- DORA metrics (deployment frequency, lead time, MTTR, change failure rate)
- AI performance (latency, cost, accuracy)
- User engagement (DAU, retention, feature usage)
