/**
 * Tiny typed HTTP client for the IntelliFlow Partner API (ADR-070).
 *
 * Wire format (the API has NO tRPC transformer):
 * - mutation: `POST {baseUrl}/api/trpc/<proc>` with the raw input as the JSON body
 * - query:    `GET  {baseUrl}/api/trpc/<proc>?input=<url-encoded JSON of the raw input>`
 * - success:  `{ result: { data: <output> } }`
 * - failure:  `{ error: { message, data: { code } } }`
 * Inputs are validated before sending and outputs are parsed against the contract.
 */

import {
  MEMBERSHIP_ERROR_REASONS,
  PROCEDURES,
  type MembershipErrorReason,
  type ProcedureInput,
  type ProcedureName,
  type ProcedureOutput,
} from './schemas';

export type PartnerErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'INTERNAL_SERVER_ERROR'
  | 'UNKNOWN';

export class PartnerApiError extends Error {
  constructor(
    message: string,
    readonly code: PartnerErrorCode,
    readonly httpStatus: number,
    /** ADR-071 machine-readable reason (e.g. ACCOUNT_IN_OTHER_TENANT), when the API sent one. */
    readonly reason: MembershipErrorReason | null = null
  ) {
    super(message);
    this.name = 'PartnerApiError';
  }
}

export interface PartnerClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
}

const KNOWN_CODES = new Set<PartnerErrorCode>([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'CONFLICT',
  'NOT_FOUND',
  'BAD_REQUEST',
  'INTERNAL_SERVER_ERROR',
]);

function toErrorCode(raw: unknown): PartnerErrorCode {
  return typeof raw === 'string' && KNOWN_CODES.has(raw as PartnerErrorCode)
    ? (raw as PartnerErrorCode)
    : 'UNKNOWN';
}

const KNOWN_REASONS = new Set<string>(MEMBERSHIP_ERROR_REASONS);

/** Reason from `error.data.reason`, else from a `REASON: ...` message prefix. */
export function toErrorReason(message: unknown, dataReason: unknown): MembershipErrorReason | null {
  if (typeof dataReason === 'string' && KNOWN_REASONS.has(dataReason)) {
    return dataReason as MembershipErrorReason;
  }
  if (typeof message === 'string') {
    const m = /^([A-Z_]+):/.exec(message);
    if (m && KNOWN_REASONS.has(m[1]!)) return m[1] as MembershipErrorReason;
  }
  return null;
}

export type PartnerClient = {
  call<N extends ProcedureName>(
    procedure: N,
    input: ProcedureInput<N>
  ): Promise<ProcedureOutput<N>>;
} & {
  [P in ProcedureName as P extends `partner.${infer M}` ? M : never]: (
    input: ProcedureInput<P>
  ) => Promise<ProcedureOutput<P>>;
};

export function createPartnerClient(options: PartnerClientOptions): PartnerClient {
  const doFetch = options.fetch ?? globalThis.fetch;
  let base = options.baseUrl;
  while (base.endsWith('/')) base = base.slice(0, -1);

  async function call<N extends ProcedureName>(
    procedure: N,
    input: ProcedureInput<N>
  ): Promise<ProcedureOutput<N>> {
    const def = PROCEDURES[procedure];
    const parsedInput = def.input.parse(input);
    const url = `${base}/api/trpc/${procedure}`;
    const headers: Record<string, string> = { authorization: `Bearer ${options.apiKey}` };

    let res: Response;
    if (def.kind === 'query') {
      res = await doFetch(`${url}?input=${encodeURIComponent(JSON.stringify(parsedInput))}`, {
        method: 'GET',
        headers,
      });
    } else {
      res = await doFetch(url, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(parsedInput),
      });
    }

    let body: any;
    try {
      body = await res.json();
    } catch {
      throw new PartnerApiError(`Non-JSON response (HTTP ${res.status})`, 'UNKNOWN', res.status);
    }

    if (body?.error) {
      throw new PartnerApiError(
        String(body.error.message ?? 'Partner API error'),
        toErrorCode(body.error.data?.code),
        res.status,
        toErrorReason(body.error.message, body.error.data?.reason)
      );
    }
    if (!res.ok || body?.result === undefined) {
      throw new PartnerApiError(`Unexpected response (HTTP ${res.status})`, 'UNKNOWN', res.status);
    }
    return def.output.parse(body.result.data) as ProcedureOutput<N>;
  }

  const client: Record<string, unknown> = { call };
  for (const name of Object.keys(PROCEDURES) as ProcedureName[]) {
    if (name.startsWith('partner.')) {
      client[name.slice('partner.'.length)] = (input: never) => call(name, input);
    }
  }
  return client as PartnerClient;
}
