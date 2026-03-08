import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type PrivacyPolicyMetadata = {
  title: string;
  version: string;
  effectiveDate: string;
  contactEmail: string;
  summary: string[];
};

export type PrivacyPolicySection = {
  id: string;
  heading: string;
  body: string[];
};

export type ParsedPrivacyPolicy = {
  metadata: PrivacyPolicyMetadata;
  sections: PrivacyPolicySection[];
};

export type ConsentRecord = {
  policyVersion: string;
  reviewedAt: string;
  route: '/privacy';
};

const POLICY_PATH_CANDIDATES = [
  resolve(process.cwd(), 'docs/shared/privacy-content.md'),
  resolve(process.cwd(), '../../docs/shared/privacy-content.md'),
  resolve(process.cwd(), '../docs/shared/privacy-content.md'),
];

function resolvePolicyPath(): string {
  const match = POLICY_PATH_CANDIDATES.find((candidate) => existsSync(candidate));

  if (!match) {
    throw new Error('Unable to locate docs/shared/privacy-content.md');
  }

  return match;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseFrontmatter(raw: string): { metadata: PrivacyPolicyMetadata; body: string } {
  if (!raw.startsWith('---\n')) {
    throw new Error('Privacy policy content is missing frontmatter.');
  }

  const closingIndex = raw.indexOf('\n---\n', 4);
  if (closingIndex === -1) {
    throw new Error('Privacy policy frontmatter is not terminated.');
  }

  const frontmatter = raw.slice(4, closingIndex).split(/\r?\n/);
  const body = raw.slice(closingIndex + 5).trim();

  const metadata: PrivacyPolicyMetadata = {
    title: '',
    version: '',
    effectiveDate: '',
    contactEmail: '',
    summary: [],
  };

  let currentListKey: 'summary' | null = null;

  for (const line of frontmatter) {
    if (line.startsWith('title: ')) {
      metadata.title = line.slice(7).trim();
      currentListKey = null;
      continue;
    }

    if (line.startsWith('version: ')) {
      metadata.version = line.slice(9).trim();
      currentListKey = null;
      continue;
    }

    if (line.startsWith('effectiveDate: ')) {
      metadata.effectiveDate = line.slice(15).trim();
      currentListKey = null;
      continue;
    }

    if (line.startsWith('contactEmail: ')) {
      metadata.contactEmail = line.slice(14).trim();
      currentListKey = null;
      continue;
    }

    if (line.trim() === 'summary:') {
      currentListKey = 'summary';
      continue;
    }

    if (currentListKey === 'summary' && line.trim().startsWith('- ')) {
      metadata.summary.push(line.trim().slice(2).trim());
    }
  }

  return { metadata, body };
}

function parseSections(body: string): PrivacyPolicySection[] {
  const rawSections = body
    .split(/\r?\n## /)
    .map((section, index) => (index === 0 ? section.replace(/^## /, '') : section))
    .filter(Boolean);

  return rawSections.map((section) => {
    const [headingLine, ...rest] = section.split(/\r?\n/);
    const paragraphs = rest
      .join('\n')
      .split(/\r?\n\r?\n/)
      .map((paragraph) => paragraph.replace(/\r?\n/g, ' ').trim())
      .filter(Boolean);

    return {
      id: slugify(headingLine.trim()),
      heading: headingLine.trim(),
      body: paragraphs,
    };
  });
}

export function getPrivacyPolicy(): ParsedPrivacyPolicy {
  const source = readFileSync(resolvePolicyPath(), 'utf-8');
  const { metadata, body } = parseFrontmatter(source);

  return {
    metadata,
    sections: parseSections(body),
  };
}

export function formatPolicyDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(isoDate));
}

export function buildConsentRecord(reviewedAt = new Date().toISOString()): ConsentRecord {
  const policy = getPrivacyPolicy();

  return {
    policyVersion: policy.metadata.version,
    reviewedAt,
    route: '/privacy',
  };
}
