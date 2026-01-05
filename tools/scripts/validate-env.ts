#!/usr/bin/env tsx

/**
 * Environment Variable Validation Script
 *
 * Validates all environment variables required for IntelliFlow CRM.
 * This script ensures that:
 * - All required environment variables are present
 * - Variables have valid formats (URLs, keys, etc.)
 * - Configuration values are within acceptable ranges
 * - Security-sensitive variables meet minimum standards
 *
 * Usage:
 *   pnpm tsx tools/scripts/validate-env.ts
 *   pnpm tsx tools/scripts/validate-env.ts --env production
 *   pnpm tsx tools/scripts/validate-env.ts --output artifacts/misc/env-validation-results.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary: {
    totalVariables: number;
    requiredVariables: number;
    optionalVariables: number;
    validVariables: number;
    invalidVariables: number;
    missingVariables: number;
  };
  environment: string;
  timestamp: string;
}

interface ValidationError {
  variable: string;
  type: 'missing' | 'invalid_format' | 'invalid_value' | 'security';
  message: string;
  severity: 'critical' | 'high' | 'medium';
}

interface ValidationWarning {
  variable: string;
  message: string;
  recommendation?: string;
}

// Define validation schemas for different variable types
const urlSchema = z.string().url();
const portSchema = z.coerce.number().int().min(1).max(65535);
const booleanSchema = z.enum(['true', 'false', 'TRUE', 'FALSE', '1', '0']);
const emailSchema = z.string().email();
const uuidSchema = z.string().uuid();

// Environment variable definitions
interface EnvVarDefinition {
  name: string;
  required: boolean;
  schema?: z.ZodSchema;
  validate?: (value: string) => boolean;
  description: string;
  defaultValue?: string;
  environments?: string[];
  securityCheck?: boolean;
}

const ENV_DEFINITIONS: EnvVarDefinition[] = [
  // Vault Configuration
  {
    name: 'VAULT_ADDR',
    required: false,
    schema: urlSchema,
    description: 'HashiCorp Vault address',
    environments: ['production', 'staging'],
  },
  {
    name: 'VAULT_NAMESPACE',
    required: false,
    description: 'Vault namespace',
    environments: ['production', 'staging'],
  },
  {
    name: 'VAULT_TOKEN',
    required: false,
    description: 'Vault authentication token',
    securityCheck: true,
    environments: ['production', 'staging'],
  },

  // Database Configuration
  {
    name: 'DATABASE_URL',
    required: true,
    validate: (v) => v.startsWith('postgresql://'),
    description: 'PostgreSQL connection URL',
    securityCheck: true,
  },
  {
    name: 'DATABASE_DIRECT_URL',
    required: false,
    validate: (v) => v.startsWith('postgresql://'),
    description: 'Direct PostgreSQL connection URL (for migrations)',
  },
  {
    name: 'DATABASE_POOL_SIZE',
    required: false,
    schema: z.coerce.number().int().min(1).max(100),
    description: 'Database connection pool size',
    defaultValue: '20',
  },

  // Supabase Configuration
  {
    name: 'SUPABASE_URL',
    required: true,
    schema: urlSchema,
    description: 'Supabase project URL',
  },
  {
    name: 'SUPABASE_ANON_KEY',
    required: true,
    description: 'Supabase anonymous key',
    securityCheck: true,
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    required: true,
    description: 'Supabase service role key',
    securityCheck: true,
  },
  {
    name: 'SUPABASE_JWT_SECRET',
    required: false,
    description: 'Supabase JWT secret',
    securityCheck: true,
    environments: ['production', 'staging'],
  },

  // Redis Configuration
  {
    name: 'REDIS_URL',
    required: true,
    validate: (v) => v.startsWith('redis://') || v.startsWith('rediss://'),
    description: 'Redis connection URL',
  },
  {
    name: 'REDIS_PASSWORD',
    required: false,
    description: 'Redis authentication password',
    securityCheck: true,
    environments: ['production', 'staging'],
  },

  // AI/LLM Configuration
  {
    name: 'OPENAI_API_KEY',
    required: true,
    validate: (v) => v.startsWith('sk-'),
    description: 'OpenAI API key',
    securityCheck: true,
  },
  {
    name: 'OPENAI_MODEL',
    required: false,
    description: 'OpenAI model name',
    defaultValue: 'gpt-4-turbo-preview',
  },
  {
    name: 'OLLAMA_BASE_URL',
    required: false,
    schema: urlSchema,
    description: 'Ollama base URL for local AI development',
    defaultValue: 'http://localhost:11434',
  },
  {
    name: 'LANGCHAIN_API_KEY',
    required: false,
    description: 'LangChain API key for tracing',
    environments: ['production', 'staging'],
  },

  // Authentication
  {
    name: 'NEXTAUTH_URL',
    required: true,
    schema: urlSchema,
    description: 'NextAuth.js application URL',
  },
  {
    name: 'NEXTAUTH_SECRET',
    required: true,
    validate: (v) => v.length >= 32,
    description: 'NextAuth.js secret (min 32 characters)',
    securityCheck: true,
  },
  {
    name: 'JWT_SECRET',
    required: true,
    validate: (v) => v.length >= 32,
    description: 'JWT signing secret (min 32 characters)',
    securityCheck: true,
  },

  // API Configuration
  {
    name: 'API_PORT',
    required: false,
    schema: portSchema,
    description: 'API server port',
    defaultValue: '3001',
  },
  {
    name: 'NEXT_PUBLIC_API_URL',
    required: true,
    schema: urlSchema,
    description: 'Public API URL for frontend',
  },

  // Observability
  {
    name: 'SENTRY_DSN',
    required: false,
    schema: urlSchema,
    description: 'Sentry DSN for error tracking',
    environments: ['production', 'staging'],
  },
  {
    name: 'OTEL_EXPORTER_OTLP_ENDPOINT',
    required: false,
    schema: urlSchema,
    description: 'OpenTelemetry OTLP endpoint',
  },

  // Environment Identifier
  {
    name: 'NODE_ENV',
    required: true,
    schema: z.enum(['development', 'test', 'production']),
    description: 'Node.js environment',
  },
  {
    name: 'ENVIRONMENT',
    required: false,
    schema: z.enum(['local', 'development', 'staging', 'production']),
    description: 'Deployment environment',
    defaultValue: 'local',
  },

  // Security
  {
    name: 'ENCRYPTION_KEY',
    required: true,
    validate: (v) => v.length >= 32,
    description: 'Encryption key (min 32 characters)',
    securityCheck: true,
  },
];

/**
 * Load environment variables from .env file
 */
function loadEnvFile(envPath: string): Record<string, string> {
  const env: Record<string, string> = {};

  if (!fs.existsSync(envPath)) {
    console.warn(`${colors.yellow}Warning: .env file not found at ${envPath}${colors.reset}`);
    return env;
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      env[key.trim()] = value.trim();
    }
  }

  return env;
}

class EnvValidator {
  private errors: ValidationError[] = [];
  private warnings: ValidationWarning[] = [];
  private environment: string;

  constructor(environment: string = 'development') {
    this.environment = environment;
  }

  /**
   * Validate a single environment variable
   */
  private validateVariable(definition: EnvVarDefinition, value: string | undefined): boolean {
    const { name, required, schema, validate, environments, securityCheck } = definition;

    // Check if variable is required for this environment
    if (environments && !environments.includes(this.environment)) {
      if (!value) return true; // Not required for this environment
    }

    // Check if required variable is missing
    if (required && !value) {
      this.errors.push({
        variable: name,
        type: 'missing',
        message: `Required environment variable '${name}' is missing`,
        severity: 'critical',
      });
      return false;
    }

    // If optional and not provided, skip validation
    if (!required && !value) {
      return true;
    }

    // Validate format using Zod schema
    if (schema && value) {
      const result = schema.safeParse(value);
      if (!result.success) {
        this.errors.push({
          variable: name,
          type: 'invalid_format',
          message: `Invalid format for '${name}': ${result.error.errors[0]?.message}`,
          severity: 'high',
        });
        return false;
      }
    }

    // Custom validation function
    if (validate && value && !validate(value)) {
      this.errors.push({
        variable: name,
        type: 'invalid_value',
        message: `Invalid value for '${name}'`,
        severity: 'high',
      });
      return false;
    }

    // Security checks
    if (securityCheck && value) {
      this.performSecurityCheck(name, value);
    }

    return true;
  }

  /**
   * Perform security checks on sensitive variables
   */
  private performSecurityCheck(name: string, value: string): void {
    // Check for placeholder values
    const placeholders = [
      '<your-',
      'your-',
      'changeme',
      'change-me',
      'placeholder',
      'example',
      'test123',
      'password',
      'secret',
    ];

    const lowerValue = value.toLowerCase();
    for (const placeholder of placeholders) {
      if (lowerValue.includes(placeholder)) {
        this.errors.push({
          variable: name,
          type: 'security',
          message: `Security-sensitive variable '${name}' appears to contain a placeholder value`,
          severity: 'critical',
        });
        return;
      }
    }

    // Check minimum length for secrets
    if (name.includes('SECRET') || name.includes('KEY') || name.includes('TOKEN')) {
      if (value.length < 20) {
        this.warnings.push({
          variable: name,
          message: `Security variable '${name}' is shorter than recommended (20+ characters)`,
          recommendation: 'Use a longer, cryptographically secure value',
        });
      }
    }

    // Check for URLs in production without HTTPS
    if (this.environment === 'production' && name.includes('URL')) {
      if (value.startsWith('http://') && !value.includes('localhost')) {
        this.warnings.push({
          variable: name,
          message: `URL '${name}' uses HTTP instead of HTTPS in production`,
          recommendation: 'Use HTTPS for all production URLs',
        });
      }
    }
  }

  /**
   * Validate all environment variables
   */
  validate(envVars: Record<string, string>): ValidationResult {
    const startTime = Date.now();
    let validCount = 0;
    let invalidCount = 0;
    let missingCount = 0;

    console.log(
      `${colors.blue}Validating environment variables for: ${this.environment}${colors.reset}\n`
    );

    for (const definition of ENV_DEFINITIONS) {
      const value = envVars[definition.name];
      const isValid = this.validateVariable(definition, value);

      if (isValid) {
        validCount++;
        console.log(`${colors.green}✓${colors.reset} ${definition.name}`);
      } else {
        invalidCount++;
        if (!value) missingCount++;
        console.log(`${colors.red}✗${colors.reset} ${definition.name}`);
      }
    }

    const duration = Date.now() - startTime;

    // Print summary
    console.log(`\n${colors.blue}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.blue}Validation Summary${colors.reset}`);
    console.log(`${colors.blue}═══════════════════════════════════════${colors.reset}`);
    console.log(`Total Variables: ${ENV_DEFINITIONS.length}`);
    console.log(`${colors.green}Valid: ${validCount}${colors.reset}`);
    console.log(`${colors.red}Invalid: ${invalidCount}${colors.reset}`);
    console.log(`${colors.yellow}Missing: ${missingCount}${colors.reset}`);
    console.log(`Duration: ${duration}ms\n`);

    // Print errors
    if (this.errors.length > 0) {
      console.log(`${colors.red}Errors (${this.errors.length}):${colors.reset}`);
      for (const error of this.errors) {
        console.log(
          `  ${colors.red}✗${colors.reset} [${error.severity.toUpperCase()}] ${error.variable}: ${error.message}`
        );
      }
      console.log();
    }

    // Print warnings
    if (this.warnings.length > 0) {
      console.log(`${colors.yellow}Warnings (${this.warnings.length}):${colors.reset}`);
      for (const warning of this.warnings) {
        console.log(`  ${colors.yellow}⚠${colors.reset} ${warning.variable}: ${warning.message}`);
        if (warning.recommendation) {
          console.log(`    ${colors.gray}→ ${warning.recommendation}${colors.reset}`);
        }
      }
      console.log();
    }

    const result: ValidationResult = {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      summary: {
        totalVariables: ENV_DEFINITIONS.length,
        requiredVariables: ENV_DEFINITIONS.filter((d) => d.required).length,
        optionalVariables: ENV_DEFINITIONS.filter((d) => !d.required).length,
        validVariables: validCount,
        invalidVariables: invalidCount,
        missingVariables: missingCount,
      },
      environment: this.environment,
      timestamp: new Date().toISOString(),
    };

    return result;
  }

  /**
   * Generate validation report
   */
  generateReport(result: ValidationResult, outputPath?: string): void {
    const report = JSON.stringify(result, null, 2);

    if (outputPath) {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(outputPath, report);
      console.log(`${colors.green}Validation report saved to: ${outputPath}${colors.reset}`);
    }
  }
}

// CLI Handler
async function main() {
  const args = process.argv.slice(2);
  const envArg = args.find((arg) => arg.startsWith('--env='));
  const outputArg = args.find((arg) => arg.startsWith('--output='));

  const environment = envArg ? envArg.split('=')[1] : process.env.NODE_ENV || 'development';
  const outputPath = outputArg ? outputArg.split('=')[1] : undefined;

  // Determine which .env file to load
  const envFiles = [`.env.${environment}`, '.env.local', '.env'];

  let envVars: Record<string, string> = { ...process.env } as Record<string, string>;

  for (const envFile of envFiles) {
    const envPath = path.resolve(process.cwd(), envFile);
    const fileVars = loadEnvFile(envPath);
    envVars = { ...envVars, ...fileVars };
  }

  // Validate
  const validator = new EnvValidator(environment);
  const result = validator.validate(envVars);

  // Generate report
  if (outputPath) {
    validator.generateReport(result, outputPath);
  }

  // Exit with error code if validation failed
  if (!result.valid) {
    console.log(
      `${colors.red}Validation failed with ${result.errors.length} error(s)${colors.reset}`
    );
    process.exit(1);
  }

  console.log(`${colors.green}✓ All environment variables are valid${colors.reset}`);
  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}Error:${colors.reset}`, error);
    process.exit(1);
  });
}

export { EnvValidator, ValidationResult, ValidationError, ValidationWarning };
