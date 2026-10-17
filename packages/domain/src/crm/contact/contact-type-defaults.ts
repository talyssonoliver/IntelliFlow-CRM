/**
 * Contact type defaults — PG-205 (ADR-080).
 *
 * Tenants configure contact types keyed by the value already stored in
 * `Contact.contactType`; the six `CONTACT_TYPES` are the seed set and reserved
 * keys. A type is applied when a contact is created. This module decides,
 * without any I/O, which status, department, owner and tags a new contact gets
 * and which of the type's required fields are missing. Owner ruling
 * 2026-10-17: explicit input first, then the type ("default values").
 */

import { CONTACT_TYPES, CONTACT_TYPE_KEY_PATTERN, type ContactStatus } from './Contact';
import { ACCOUNT_OWNER_ADMIN_ROLES } from '../account/territory/territory-constants';

/**
 * Fields a contact type may require. Real contact columns only: the tenant-wide
 * policy key `jobTitle` maps to `title` (see CONTACT_POLICY_FIELD_TO_COLUMN).
 */
export const CONTACT_TYPE_REQUIRED_FIELD_KEYS = [
  'phone',
  'company',
  'title',
  'department',
  'accountId',
] as const;

export type ContactTypeRequiredFieldKey = (typeof CONTACT_TYPE_REQUIRED_FIELD_KEYS)[number];

/** Who owns a new contact of this type. Never an arbitrary user id. */
export const CONTACT_TYPE_OWNER_DEFAULTS = ['CREATOR', 'ACCOUNT_OWNER'] as const;

export type ContactTypeOwnerDefault = (typeof CONTACT_TYPE_OWNER_DEFAULTS)[number];

/** Limits shared by the validators, the router and the UI. */
export const CONTACT_TYPE_LIMITS = {
  maxTypesPerTenant: 50,
  maxNameLength: 50,
  maxDefaultTags: 10,
  maxTagsPerContact: 20,
  maxDepartmentLength: 100,
  maxKeyLength: 40,
} as const;

/** Roles allowed to change contact types — the one shared admin role list. */
export const CONTACT_TYPE_ADMIN_ROLES = ACCOUNT_OWNER_ADMIN_ROLES;

const ADMIN_ROLE_SET: ReadonlySet<string> = new Set(CONTACT_TYPE_ADMIN_ROLES);

export function isContactTypeAdminRole(role: string | null | undefined): boolean {
  return role != null && ADMIN_ROLE_SET.has(role);
}

/**
 * Tenant-wide required-field policy keys (`ContactRequiredField.fieldKey`) →
 * the contact field each one checks. `jobTitle` was never a contact field; the
 * column is `title` (PG-205 B14).
 */
export const CONTACT_POLICY_FIELD_TO_COLUMN = {
  email: 'email',
  phone: 'phone',
  company: 'company',
  jobTitle: 'title',
  ownerId: 'ownerId',
} as const;

const RESERVED_KEY_SET: ReadonlySet<string> = new Set(CONTACT_TYPES);

/** The six seed keys are reserved for the system types. */
export function isReservedContactTypeKey(key: string): boolean {
  return RESERVED_KEY_SET.has(key);
}

/** Trim leading/trailing underscores without a backtracking regex. */
function trimUnderscores(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '_') start += 1;
  while (end > start && value[end - 1] === '_') end -= 1;
  return value.slice(start, end);
}

/** Combining diacritical marks (U+0300–U+036F) left behind by NFKD. */
function isCombiningMark(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code >= 0x300 && code <= 0x36f;
}

function slugify(name: string): string {
  const folded = Array.from(name.normalize('NFKD'))
    .filter((char) => !isCombiningMark(char))
    .join('')
    .toLowerCase();
  const slug = trimUnderscores(folded.replace(/[^a-z0-9]+/g, '_'));
  if (slug === '') return 'type';
  return /^[a-z]/.test(slug) ? slug : `type_${slug}`;
}

/**
 * Server-side key for a new custom type: a slug of the name, never a reserved
 * key, with `_2`, `_3`… on collision, always within the key length limit.
 */
export function generateContactTypeKey(name: string, taken: ReadonlySet<string>): string {
  const max = CONTACT_TYPE_LIMITS.maxKeyLength;
  const base = trimUnderscores(slugify(name).slice(0, max));
  const isFree = (key: string) => !taken.has(key) && !isReservedContactTypeKey(key);
  if (isFree(base) && CONTACT_TYPE_KEY_PATTERN.test(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `_${n}`;
    const candidate = `${trimUnderscores(base.slice(0, max - suffix.length))}${suffix}`;
    if (isFree(candidate)) return candidate;
  }
}

export interface ContactTypeDefaultsSource {
  defaultStatus: ContactStatus | null;
  defaultDepartment: string | null;
  defaultOwner: ContactTypeOwnerDefault;
}

export interface ResolveContactCreateDefaultsArgs {
  input: { status?: ContactStatus; department?: string | null; tags?: readonly string[] };
  type: ContactTypeDefaultsSource | null;
  creatorId: string;
  /**
   * The contact's linked account as the caller resolved it inside the
   * caller's tenant: `ownerValid` is true only when the account owner is a
   * live member of that tenant.
   */
  account: { linked: boolean; ownerId: string | null; ownerValid: boolean };
  /** Current names of the type's active default tags (caller-resolved). */
  defaultTagNames: readonly string[];
}

export type ContactOwnerFallback = 'no_account' | 'no_account_owner' | 'account_owner_invalid';

export interface ResolvedContactCreateDefaults {
  status: ContactStatus | undefined;
  department: string | undefined;
  ownerId: string;
  ownerSource: 'creator' | 'account_owner';
  ownerFallback: ContactOwnerFallback | null;
  tags: string[];
  /** Field names the type filled in (audit metadata; never values). */
  appliedDefaults: string[];
}

function isFilled(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveOwner(
  args: ResolveContactCreateDefaultsArgs
): Pick<ResolvedContactCreateDefaults, 'ownerId' | 'ownerSource' | 'ownerFallback'> {
  const creator = { ownerId: args.creatorId, ownerSource: 'creator' as const };
  if (args.type?.defaultOwner !== 'ACCOUNT_OWNER') return { ...creator, ownerFallback: null };
  if (!args.account.linked) return { ...creator, ownerFallback: 'no_account' };
  if (args.account.ownerId == null) return { ...creator, ownerFallback: 'no_account_owner' };
  if (!args.account.ownerValid) return { ...creator, ownerFallback: 'account_owner_invalid' };
  return { ownerId: args.account.ownerId, ownerSource: 'account_owner', ownerFallback: null };
}

function mergeTags(input: readonly string[], defaults: readonly string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const tag of [...input, ...defaults]) {
    const folded = tag.toLowerCase();
    if (seen.has(folded)) continue;
    seen.add(folded);
    merged.push(tag);
  }
  return merged.slice(0, CONTACT_TYPE_LIMITS.maxTagsPerContact);
}

export function resolveContactCreateDefaults(
  args: ResolveContactCreateDefaultsArgs
): ResolvedContactCreateDefaults {
  const appliedDefaults: string[] = [];

  let status = args.input.status;
  if (status === undefined && args.type?.defaultStatus) {
    status = args.type.defaultStatus;
    appliedDefaults.push('status');
  }

  let department = isFilled(args.input.department) ? args.input.department : undefined;
  const typeDepartment = args.type?.defaultDepartment;
  if (department === undefined && isFilled(typeDepartment)) {
    department = typeDepartment;
    appliedDefaults.push('department');
  }

  const owner = resolveOwner(args);
  if (owner.ownerSource === 'account_owner') appliedDefaults.push('ownerId');

  const inputTags = args.input.tags ?? [];
  const tags = mergeTags(inputTags, args.type ? args.defaultTagNames : []);
  if (tags.length > mergeTags(inputTags, []).length) appliedDefaults.push('tags');

  return { status, department, ...owner, tags, appliedDefaults };
}

/**
 * The type's required fields that are blank in `values`, in key order.
 * Unknown keys stored on a type are ignored.
 */
export function missingTypeRequiredFields(
  required: readonly string[],
  values: Partial<Record<ContactTypeRequiredFieldKey, string | null | undefined>>
): ContactTypeRequiredFieldKey[] {
  const wanted = new Set(required);
  return CONTACT_TYPE_REQUIRED_FIELD_KEYS.filter(
    (key) => wanted.has(key) && !isFilled(values[key])
  );
}
