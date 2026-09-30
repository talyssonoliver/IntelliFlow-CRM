import { z } from 'zod';
import { CONTRACT_VERSION, PARTNER_SCOPES, PROCEDURES } from './schemas';

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
  };
}
