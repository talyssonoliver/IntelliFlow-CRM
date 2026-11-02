import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { DESIRED } from '../observability/apply-railway-self-healing.mjs';

// ENV-008-AI AC-009: the three Sprint-0 files no running system loads are now
// descriptive records of what does run (ADR-087). These tests pin each record
// to its real source of truth, so the description cannot drift from it.

const ROOT = join(__dirname, '../../..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const SELF_HEALING = 'infra/monitoring/self-healing-rules.yaml';
const ANOMALY = 'infra/monitoring/anomaly-detection.json';
const OTEL = 'infra/monitoring/otel-config.yaml';

const SLOS = JSON.parse(read('infra/monitoring/grafana/cloud/slos.json')) as {
  slos: Array<{ uuid: string }>;
};

describe('self-healing-rules.yaml', () => {
  const doc = yaml.load(read(SELF_HEALING)) as Record<string, unknown>;

  it('is a descriptive record of the settings CI applies', () => {
    expect(doc.mode).toBe('descriptive');
    expect(doc.applied_by).toBe('.github/workflows/railway-self-healing.yml');
    expect(String(doc.source_of_truth)).toContain(
      'tools/scripts/observability/apply-railway-self-healing.mjs'
    );
  });

  it('copies the per-service settings from DESIRED exactly', () => {
    expect(doc.services).toEqual(DESIRED);
  });

  it('states the limits: crash-only restart and a deploy-gate health check', () => {
    const limits = (doc.limits as string[]).join('\n');
    expect(limits).toMatch(/crash/i);
    expect(limits).toMatch(/deploy/i);
    expect(limits).toMatch(/not a liveness probe/i);
  });

  it('no longer carries the Sprint-0 operator playbooks', () => {
    expect(doc).not.toHaveProperty('playbooks');
    expect(read(SELF_HEALING)).not.toContain('operator_action');
  });
});

describe('anomaly-detection.json', () => {
  const doc = JSON.parse(read(ANOMALY)) as Record<string, unknown>;

  it('is a descriptive record of the Grafana Asserts rules', () => {
    expect(doc.mode).toBe('descriptive');
    expect(doc.engine).toBe('grafana-asserts (plugin-managed)');
    expect(doc.services).toEqual(['api', 'ai-worker']);
    const names = (doc.rules as Array<{ name: string; sourceSeries: string }>).map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(['RequestRateAnomaly', 'ErrorRatioAnomaly', 'LatencyP95Anomaly'])
    );
    for (const rule of doc.rules as Array<{ sourceSeries: string }>) {
      expect(rule.sourceSeries).toMatch(/^traces_spanmetrics_/);
    }
  });

  it('lists the SLOs that slos.json defines', () => {
    expect(doc.slos).toEqual(SLOS.slos.map((s) => s.uuid));
  });

  it('drops the Sprint-0 placeholder signals no service emits', () => {
    const text = read(ANOMALY);
    expect(text).not.toContain('http_request_duration_seconds');
    expect(text).not.toContain('ai_cost_usd');
  });
});

describe('otel-config.yaml', () => {
  const text = read(OTEL);

  it('stays a valid local collector config with the same top-level keys', () => {
    const doc = yaml.load(text) as Record<string, unknown>;
    expect(Object.keys(doc)).toEqual([
      'receivers',
      'processors',
      'exporters',
      'extensions',
      'service',
    ]);
  });

  it('describes the production topology in comments', () => {
    const comments = text
      .split(/\r?\n/)
      .filter((l) => l.trim().startsWith('#'))
      .join('\n');
    for (const phrase of [
      'Production topology',
      'local-stack reference',
      'Grafana Cloud OTLP gateway',
      'no collector',
      'api',
      'ai-worker',
      'ADR-087',
    ]) {
      expect(comments).toContain(phrase);
    }
  });
});

describe.each([SELF_HEALING, ANOMALY, OTEL])('%s', (file) => {
  const text = read(file);

  it('references only repo paths that exist', () => {
    const prefixes = ['infra/', 'tools/', 'docs/', 'apps/', 'packages/', '.github/'];
    const paths = text
      .split(/[\s"'`(),]+/)
      .filter((token) => prefixes.some((prefix) => token.startsWith(prefix)))
      .map((token) => {
        let end = token.length;
        while (end > 0 && '.:;'.includes(token[end - 1])) end -= 1;
        return token.slice(0, end);
      })
      .filter((p) => !p.includes('*'));
    for (const p of paths) expect(existsSync(join(ROOT, p)), p).toBe(true);
  });

  it('holds no credential, address or identifier', () => {
    const looksLikeEmail = (token: string) => {
      const at = token.indexOf('@');
      return at > 0 && /\w/.test(token[at - 1]) && token.indexOf('.', at) > at + 1;
    };
    expect(text.split(/\s+/).filter(looksLikeEmail)).toEqual([]);
    const urls = text.split(/\s+/).filter((t) => t.includes('://'));
    expect(urls.filter((u) => u.toLowerCase().includes('hook'))).toEqual([]); // a webhook URL
    const patterns = [
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // a UUID-shaped ID
      new RegExp('Bear' + 'er\\s'),
      new RegExp('gl' + 'sa_'),
      /(?<![\w/.-])[A-Za-z0-9+]{40,}/, // a long base64 run
    ];
    for (const pattern of patterns) expect(text, String(pattern)).not.toMatch(pattern);
  });
});

it('the real collector config used elsewhere still exists', () => {
  expect(existsSync(join(ROOT, 'infra/monitoring/otel-collector.yaml'))).toBe(true);
});
