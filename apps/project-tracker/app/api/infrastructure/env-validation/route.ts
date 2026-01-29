/**
 * GET /api/infrastructure/env-validation
 *
 * RSI endpoint for environment validation and health checks.
 * Sources: Health check configs, service status, env requirements
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  responseTime?: number;
  lastCheck: string;
  details?: string;
}

interface EnvVariable {
  name: string;
  required: boolean;
  set: boolean;
  valid: boolean;
  category: 'database' | 'auth' | 'api' | 'feature' | 'other';
}

function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

// Load health check configuration
function loadHealthCheckConfig(): any | null {
  const projectRoot = getProjectRoot();
  const healthPath = join(projectRoot, 'artifacts', 'misc', 'health-check.yaml');

  try {
    if (existsSync(healthPath)) {
      // For now return raw content - would parse YAML in production
      const content = readFileSync(healthPath, 'utf8');
      return { raw: content, loaded: true };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// Check environment variables
function validateEnvironment(): EnvVariable[] {
  const envVars: EnvVariable[] = [];

  // Required environment variables by category
  const requiredEnvs: Record<string, { vars: string[]; category: EnvVariable['category'] }> = {
    database: {
      vars: ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'],
      category: 'database',
    },
    auth: {
      vars: ['NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
      category: 'auth',
    },
    api: {
      vars: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
      category: 'api',
    },
    feature: {
      vars: ['ENABLE_AI_FEATURES', 'ENABLE_ANALYTICS'],
      category: 'feature',
    },
  };

  for (const [, config] of Object.entries(requiredEnvs)) {
    for (const varName of config.vars) {
      const value = process.env[varName];
      envVars.push({
        name: varName,
        required: true,
        set: !!value,
        valid: !!value && value.length > 0,
        category: config.category,
      });
    }
  }

  return envVars;
}

// Simulate service health checks
function checkServices(): ServiceHealth[] {
  const services: ServiceHealth[] = [];

  // Check if services are likely running based on env vars
  services.push({
    name: 'PostgreSQL (Supabase)',
    status: process.env.DATABASE_URL ? 'healthy' : 'unknown',
    lastCheck: new Date().toISOString(),
    details: process.env.DATABASE_URL ? 'Connection string configured' : 'DATABASE_URL not set',
  });

  services.push({
    name: 'Supabase Auth',
    status: process.env.SUPABASE_ANON_KEY ? 'healthy' : 'unknown',
    lastCheck: new Date().toISOString(),
    details: process.env.SUPABASE_ANON_KEY ? 'Auth keys configured' : 'SUPABASE_ANON_KEY not set',
  });

  services.push({
    name: 'OpenAI API',
    status: process.env.OPENAI_API_KEY ? 'healthy' : 'unknown',
    lastCheck: new Date().toISOString(),
    details: process.env.OPENAI_API_KEY ? 'API key configured' : 'OPENAI_API_KEY not set',
  });

  services.push({
    name: 'Redis Cache',
    status: process.env.REDIS_URL ? 'healthy' : 'unknown',
    lastCheck: new Date().toISOString(),
    details: process.env.REDIS_URL ? 'Redis URL configured' : 'REDIS_URL not set',
  });

  return services;
}

export async function GET(_request: NextRequest) {
  try {
    const healthConfig = loadHealthCheckConfig();
    const envVars = validateEnvironment();
    const services = checkServices();

    // Calculate validation metrics
    const envSummary = {
      total: envVars.length,
      set: envVars.filter(e => e.set).length,
      valid: envVars.filter(e => e.valid).length,
      missing: envVars.filter(e => e.required && !e.set).map(e => e.name),
    };

    const serviceSummary = {
      total: services.length,
      healthy: services.filter(s => s.status === 'healthy').length,
      degraded: services.filter(s => s.status === 'degraded').length,
      unhealthy: services.filter(s => s.status === 'unhealthy').length,
      unknown: services.filter(s => s.status === 'unknown').length,
    };

    // Overall status
    const envHealthy = envSummary.missing.length === 0;
    const servicesHealthy = serviceSummary.unhealthy === 0;
    const overallStatus = envHealthy && servicesHealthy ? 'healthy' :
                          envHealthy || servicesHealthy ? 'degraded' : 'unhealthy';

    // Environment readiness by category
    const categoryReadiness: Record<string, { ready: number; total: number }> = {};
    for (const env of envVars) {
      if (!categoryReadiness[env.category]) {
        categoryReadiness[env.category] = { ready: 0, total: 0 };
      }
      categoryReadiness[env.category].total++;
      if (env.valid) categoryReadiness[env.category].ready++;
    }

    return NextResponse.json(
      {
        source: 'fresh',
        timestamp: new Date().toISOString(),
        pattern: 'RSI',
        status: overallStatus,
        environment: {
          summary: envSummary,
          byCategory: categoryReadiness,
          missing: envSummary.missing,
          percentage: Math.round((envSummary.valid / envSummary.total) * 100),
        },
        services: {
          summary: serviceSummary,
          details: services,
        },
        healthCheckConfigured: !!healthConfig,
        nodeEnv: process.env.NODE_ENV || 'development',
        recommendation: envSummary.missing.length > 0
          ? `Set missing environment variables: ${envSummary.missing.slice(0, 3).join(', ')}${envSummary.missing.length > 3 ? '...' : ''}`
          : 'Environment configuration is complete',
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error validating environment:', error);
    return NextResponse.json(
      { error: 'Failed to validate environment', details: String(error) },
      { status: 500 }
    );
  }
}
