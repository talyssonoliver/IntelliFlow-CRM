import 'server-only';
import { existsSync, readFileSync } from 'node:fs';

export type LegalContentMetadata = {
  title: string;
  version: string;
  effectiveDate: string;
  contactEmail: string;
  summary: string[];
};

export type LegalContentSection = {
  id: string;
  heading: string;
  body: string[];
};

export type ParsedLegalContent = {
  metadata: LegalContentMetadata;
  sections: LegalContentSection[];
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function resolveLegalContentPath(candidates: string[]): string {
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error(
      `Unable to locate legal content file. Candidates: ${candidates.join(', ')}`
    );
  }
  return match;
}

/**
 * Parse a single frontmatter line into the metadata object.
 * Returns the updated currentListKey, or null if reset by a scalar field.
 */
function parseFrontmatterLine(
  line: string,
  metadata: LegalContentMetadata,
  currentListKey: 'summary' | null
): 'summary' | null {
  if (line.startsWith('title: ')) {
    metadata.title = line.slice(7).trim();
    return null;
  }
  if (line.startsWith('version: ')) {
    metadata.version = line.slice(9).trim();
    return null;
  }
  if (line.startsWith('effectiveDate: ')) {
    metadata.effectiveDate = line.slice(15).trim();
    return null;
  }
  if (line.startsWith('contactEmail: ')) {
    metadata.contactEmail = line.slice(14).trim();
    return null;
  }
  if (line.trim() === 'summary:') {
    return 'summary';
  }
  if (currentListKey === 'summary' && line.trim().startsWith('- ')) {
    metadata.summary.push(line.trim().slice(2).trim());
    return currentListKey;
  }
  if (
    currentListKey === 'summary' &&
    metadata.summary.length > 0 &&
    line.startsWith(' ') &&
    line.trim().length > 0
  ) {
    const lastIndex = metadata.summary.length - 1;
    metadata.summary[lastIndex] = `${metadata.summary[lastIndex]} ${line.trim()}`;
  }
  return currentListKey;
}

export function parseLegalFrontmatter(
  raw: string,
  label: string
): { metadata: LegalContentMetadata; body: string } {
  // Normalize CRLF → LF so frontmatter detection works on Windows
  const normalized = raw.replace(/\r\n/g, '\n');

  if (!normalized.startsWith('---\n')) {
    throw new Error(`${label} content is missing frontmatter.`);
  }

  const closingIndex = normalized.indexOf('\n---\n', 4);
  if (closingIndex === -1) {
    throw new Error(`${label} frontmatter is not terminated.`);
  }

  const frontmatter = normalized.slice(4, closingIndex).split('\n');
  const body = normalized.slice(closingIndex + 5).trim();

  const metadata: LegalContentMetadata = {
    title: '',
    version: '',
    effectiveDate: '',
    contactEmail: '',
    summary: [],
  };

  let currentListKey: 'summary' | null = null;
  for (const line of frontmatter) {
    currentListKey = parseFrontmatterLine(line, metadata, currentListKey);
  }

  return { metadata, body };
}

export function parseLegalSections(body: string): LegalContentSection[] {
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

export function formatLegalDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(isoDate));
}

export function loadLegalContent(
  candidates: string[],
  label: string
): ParsedLegalContent {
  const source = readFileSync(resolveLegalContentPath(candidates), 'utf-8');
  const { metadata, body } = parseLegalFrontmatter(source, label);
  return { metadata, sections: parseLegalSections(body) };
}
