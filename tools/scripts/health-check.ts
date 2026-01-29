#!/usr/bin/env tsx

/**
 * Service Health Check Script
 *
 * Performs health checks on all services required for IntelliFlow CRM.
 * This script checks:
 * - Database connectivity (PostgreSQL/Supabase)
 * - Redis connectivity and availability
 * - External APIs (OpenAI, LangChain, etc.)
 * - Docker services status
 * - Local development servers
 *
 * Usage:
 *   pnpm tsx tools/scripts/health-check.ts
 *   pnpm tsx tools/scripts/health-check.ts --service database
 *   pnpm tsx tools/scripts/health-check.ts --timeout 5000
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  responseTime?: number;
  message?: string;
  details?: Record<string, any>;
  error?: string;
}

interface HealthCheckSummary {
  timestamp: string;
  results: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
    unknown: number;
  };
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
}

class HealthChecker {
  private timeout: number;
  private results: HealthCheckResult[] = [];

  constructor(timeout: number = 5000) {
    this.timeout = timeout;
  }

  /**
   * Load environment variables from .env file
   */
  private loadEnv(): void {
    const envFiles = ['.env.local', '.env.development', '.env'];

    for (const envFile of envFiles) {
      const envPath = path.resolve(process.cwd(), envFile);
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;

          const match = trimmed.match(/^([^=]+)=(.*)$/);
          if (match && !process.env[match[1]]) {
            process.env[match[1]] = match[2].trim();
          }
        }
      }
    }
  }

  /**
   * Execute HTTP/HTTPS request
   */
  private async httpRequest(
    url: string,
    options: { method?: string; timeout?: number } = {}
  ): Promise<{ status: number; body: string; time: number }> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const req = protocol.request(
        url,
        {
          method: options.method || 'GET',
          timeout: options.timeout || this.timeout,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            resolve({
              status: res.statusCode || 0,
              body,
              time: Date.now() - startTime,
            });
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Execute shell command
   */
  private exec(command: string): string {
    try {
      return execSync(command, { encoding: 'utf-8', stdio: 'pipe' }).trim();
    } catch (error) {
      return '';
    }
  }

  /**
   * Check PostgreSQL database connectivity
   */
  private async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      return {
        service: 'PostgreSQL Database',
        status: 'unknown',
        message: 'DATABASE_URL not configured',
      };
    }

    try {
      // Try to connect using psql if available
      const testQuery = `psql "${databaseUrl}" -c "SELECT 1" -t`;
      const result = this.exec(testQuery);
      const responseTime = Date.now() - startTime;

      if (result) {
        return {
          service: 'PostgreSQL Database',
          status: 'healthy',
          responseTime,
          message: 'Database connection successful',
        };
      }

      return {
        service: 'PostgreSQL Database',
        status: 'unhealthy',
        message: 'Database connection failed',
      };
    } catch (error) {
      return {
        service: 'PostgreSQL Database',
        status: 'unhealthy',
        message: 'Cannot verify database connection (psql not available)',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Supabase connectivity
   */
  private async checkSupabase(): Promise<HealthCheckResult> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return {
        service: 'Supabase',
        status: 'unknown',
        message: 'Supabase configuration not found',
      };
    }

    try {
      const response = await this.httpRequest(`${supabaseUrl}/rest/v1/`, {
        timeout: this.timeout,
      });

      if (response.status === 200 || response.status === 401) {
        return {
          service: 'Supabase',
          status: 'healthy',
          responseTime: response.time,
          message: 'Supabase API is reachable',
        };
      }

      return {
        service: 'Supabase',
        status: 'degraded',
        responseTime: response.time,
        message: `Unexpected status code: ${response.status}`,
      };
    } catch (error) {
      return {
        service: 'Supabase',
        status: 'unhealthy',
        message: 'Cannot reach Supabase API',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Redis connectivity
   */
  private async checkRedis(): Promise<HealthCheckResult> {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      return {
        service: 'Redis',
        status: 'unknown',
        message: 'REDIS_URL not configured',
      };
    }

    try {
      // Try to ping Redis using redis-cli if available
      const startTime = Date.now();
      const parsedUrl = new URL(redisUrl);
      const host = parsedUrl.hostname;
      const port = parsedUrl.port || '6379';

      const result = this.exec(`redis-cli -h ${host} -p ${port} ping`);
      const responseTime = Date.now() - startTime;

      if (result.includes('PONG')) {
        return {
          service: 'Redis',
          status: 'healthy',
          responseTime,
          message: 'Redis is responding',
        };
      }

      return {
        service: 'Redis',
        status: 'unhealthy',
        message: 'Redis not responding',
      };
    } catch (error) {
      return {
        service: 'Redis',
        status: 'unhealthy',
        message: 'Cannot verify Redis connection (redis-cli not available)',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check OpenAI API connectivity
   */
  private async checkOpenAI(): Promise<HealthCheckResult> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        service: 'OpenAI API',
        status: 'unknown',
        message: 'OPENAI_API_KEY not configured',
      };
    }

    try {
      // Simple check: try to list models (lightweight endpoint)
      const response = await this.httpRequest('https://api.openai.com/v1/models', {
        timeout: this.timeout,
      });

      if (response.status === 200) {
        return {
          service: 'OpenAI API',
          status: 'healthy',
          responseTime: response.time,
          message: 'OpenAI API is reachable',
        };
      }

      if (response.status === 401) {
        return {
          service: 'OpenAI API',
          status: 'unhealthy',
          message: 'Invalid API key',
        };
      }

      return {
        service: 'OpenAI API',
        status: 'degraded',
        responseTime: response.time,
        message: `Unexpected status code: ${response.status}`,
      };
    } catch (error) {
      return {
        service: 'OpenAI API',
        status: 'unhealthy',
        message: 'Cannot reach OpenAI API',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Ollama local service
   */
  private async checkOllama(): Promise<HealthCheckResult> {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    try {
      const response = await this.httpRequest(`${ollamaUrl}/api/tags`, {
        timeout: this.timeout,
      });

      if (response.status === 200) {
        const models = JSON.parse(response.body).models || [];
        return {
          service: 'Ollama',
          status: 'healthy',
          responseTime: response.time,
          message: `Ollama is running with ${models.length} model(s)`,
          details: { modelCount: models.length },
        };
      }

      return {
        service: 'Ollama',
        status: 'degraded',
        message: 'Ollama responded with unexpected status',
      };
    } catch (error) {
      return {
        service: 'Ollama',
        status: 'unhealthy',
        message: 'Ollama is not running (optional for production)',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Docker service
   */
  private async checkDocker(): Promise<HealthCheckResult> {
    try {
      const startTime = Date.now();
      const result = this.exec('docker ps');
      const responseTime = Date.now() - startTime;

      if (result) {
        const containerCount = result.split('\n').length - 1;
        return {
          service: 'Docker',
          status: 'healthy',
          responseTime,
          message: `Docker is running with ${containerCount} container(s)`,
          details: { containerCount },
        };
      }

      return {
        service: 'Docker',
        status: 'unhealthy',
        message: 'Docker daemon is not responding',
      };
    } catch (error) {
      return {
        service: 'Docker',
        status: 'unhealthy',
        message: 'Docker is not available',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Next.js development server
   */
  private async checkNextServer(): Promise<HealthCheckResult> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    try {
      const response = await this.httpRequest(appUrl, { timeout: this.timeout });

      if (response.status === 200 || response.status === 404) {
        return {
          service: 'Next.js Server',
          status: 'healthy',
          responseTime: response.time,
          message: 'Next.js server is running',
        };
      }

      return {
        service: 'Next.js Server',
        status: 'degraded',
        message: `Server returned status ${response.status}`,
      };
    } catch (error) {
      return {
        service: 'Next.js Server',
        status: 'unhealthy',
        message: 'Next.js server is not running',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check API server
   */
  private async checkAPIServer(): Promise<HealthCheckResult> {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    try {
      const response = await this.httpRequest(`${apiUrl}/health`, {
        timeout: this.timeout,
      });

      if (response.status === 200 || response.status === 404) {
        return {
          service: 'API Server',
          status: 'healthy',
          responseTime: response.time,
          message: 'API server is running',
        };
      }

      return {
        service: 'API Server',
        status: 'degraded',
        message: `Server returned status ${response.status}`,
      };
    } catch (error) {
      return {
        service: 'API Server',
        status: 'unhealthy',
        message: 'API server is not running',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Run all health checks
   */
  async check(service?: string): Promise<HealthCheckSummary> {
    this.loadEnv();

    console.log(`${colors.blue}${colors.bold}Running Health Checks${colors.reset}\n`);

    const checks = [
      { name: 'database', fn: () => this.checkDatabase() },
      { name: 'supabase', fn: () => this.checkSupabase() },
      { name: 'redis', fn: () => this.checkRedis() },
      { name: 'openai', fn: () => this.checkOpenAI() },
      { name: 'ollama', fn: () => this.checkOllama() },
      { name: 'docker', fn: () => this.checkDocker() },
      { name: 'next', fn: () => this.checkNextServer() },
      { name: 'api', fn: () => this.checkAPIServer() },
    ];

    // Filter by service if specified
    const selectedChecks = service ? checks.filter((c) => c.name === service) : checks;

    if (selectedChecks.length === 0) {
      console.log(`${colors.red}Unknown service: ${service}${colors.reset}\n`);
      process.exit(1);
    }

    // Run checks
    for (const check of selectedChecks) {
      const result = await check.fn();
      this.results.push(result);

      const statusIcon =
        result.status === 'healthy'
          ? `${colors.green}✓${colors.reset}`
          : result.status === 'degraded'
            ? `${colors.yellow}⚠${colors.reset}`
            : result.status === 'unhealthy'
              ? `${colors.red}✗${colors.reset}`
              : `${colors.gray}?${colors.reset}`;

      const timeStr = result.responseTime
        ? `${colors.gray}(${result.responseTime}ms)${colors.reset}`
        : '';

      console.log(`${statusIcon} ${result.service} ${timeStr}`);
      if (result.message) {
        console.log(`  ${colors.gray}${result.message}${colors.reset}`);
      }
      if (result.error) {
        console.log(`  ${colors.red}Error: ${result.error}${colors.reset}`);
      }
    }

    // Calculate summary
    const healthy = this.results.filter((r) => r.status === 'healthy').length;
    const unhealthy = this.results.filter((r) => r.status === 'unhealthy').length;
    const degraded = this.results.filter((r) => r.status === 'degraded').length;
    const unknown = this.results.filter((r) => r.status === 'unknown').length;

    const overallStatus: 'healthy' | 'degraded' | 'unhealthy' =
      unhealthy > 0 ? 'unhealthy' : degraded > 0 ? 'degraded' : 'healthy';

    console.log(`\n${colors.blue}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.blue}Health Check Summary${colors.reset}`);
    console.log(`${colors.blue}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.green}Healthy: ${healthy}${colors.reset}`);
    console.log(`${colors.yellow}Degraded: ${degraded}${colors.reset}`);
    console.log(`${colors.red}Unhealthy: ${unhealthy}${colors.reset}`);
    console.log(`${colors.gray}Unknown: ${unknown}${colors.reset}`);
    console.log(
      `Overall Status: ${
        overallStatus === 'healthy'
          ? `${colors.green}${overallStatus.toUpperCase()}${colors.reset}`
          : overallStatus === 'degraded'
            ? `${colors.yellow}${overallStatus.toUpperCase()}${colors.reset}`
            : `${colors.red}${overallStatus.toUpperCase()}${colors.reset}`
      }\n`
    );

    return {
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: {
        total: this.results.length,
        healthy,
        unhealthy,
        degraded,
        unknown,
      },
      overallStatus,
    };
  }
}

// CLI Handler
async function main() {
  const args = process.argv.slice(2);
  const serviceArg = args.find((arg) => arg.startsWith('--service='));
  const timeoutArg = args.find((arg) => arg.startsWith('--timeout='));

  const service = serviceArg ? serviceArg.split('=')[1] : undefined;
  const timeout = timeoutArg ? parseInt(timeoutArg.split('=')[1], 10) : 5000;

  const checker = new HealthChecker(timeout);
  const summary = await checker.check(service);

  if (summary.overallStatus === 'unhealthy') {
    console.log(`${colors.red}Health check failed${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.green}✓ Health check passed${colors.reset}\n`);
  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}Error:${colors.reset}`, error);
    process.exit(1);
  });
}

export { HealthChecker, HealthCheckResult, HealthCheckSummary };
