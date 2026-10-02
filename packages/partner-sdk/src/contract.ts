import { z } from 'zod';
import {
  ASSERTION_AUDIENCE,
  ASSERTION_MAX_TTL_SECONDS,
  CONTRACT_VERSION,
  MEMBERSHIP_ERROR_REASONS,
  PARTNER_SCOPES,
  PROCEDURES,
  SESSION_PROCEDURES,
  assertionClaimsSchema,
} from './schemas';

/** Build the published JSON contract (JSON Schema per procedure input/output). */
export function buildContract() {
  const procedures: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(PROCEDURES)) {
    procedures[name] = {
      kind: def.kind,
      scope: def.scope,
      input: z.toJSONSchema(def.input, { io: 'input' }),
      output: z.toJSONSchema(def.output, { io: 'output' }),
    };
  }
  const sessionProcedures: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(SESSION_PROCEDURES)) {
    sessionProcedures[name] = {
      kind: def.kind,
      input: z.toJSONSchema(def.input, { io: 'input' }),
      output: z.toJSONSchema(def.output, { io: 'output' }),
    };
  }
  return {
    contract: 'intelliflow-partner-api',
    version: CONTRACT_VERSION,
    transport: {
      basePath: '/api/trpc',
      auth: 'Authorization: Bearer pk_<key>',
      mutation: 'POST <basePath>/<procedure> with the raw input as the JSON body',
      query: 'GET <basePath>/<procedure>?input=<url-encoded JSON of the raw input>',
      transformer: 'none',
    },
    scopes: [...PARTNER_SCOPES],
    procedures,
    sessionProcedures,
    assertion: {
      alg: 'EdDSA',
      audience: ASSERTION_AUDIENCE,
      maxTtlSeconds: ASSERTION_MAX_TTL_SECONDS,
      claims: z.toJSONSchema(assertionClaimsSchema, { io: 'input', unrepresentable: 'any' }),
    },
    errorReasons: [...MEMBERSHIP_ERROR_REASONS],
  };
}
