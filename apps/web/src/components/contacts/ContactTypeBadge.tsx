/**
 * A contact's type as a text badge (PG-205). The name is always text; the dot is
 * decorative. A stored key with no type row (deleted type, ADR-080) shows the key
 * itself in neutral slate rather than disappearing.
 */
import { Badge } from '@intelliflow/ui';
import type { ContactTypeOptionDto } from '@intelliflow/validators';
import { contactTypeBadgeClass, contactTypeSwatchClass } from './contact-type-colors';

export interface ContactTypeBadgeProps {
  typeKey: string | null | undefined;
  /** The tenant's types (incl. inactive); undefined while loading. */
  types:
    | readonly Pick<ContactTypeOptionDto, 'key' | 'name' | 'colorToken' | 'isActive'>[]
    | undefined;
}

export function ContactTypeBadge({ typeKey, types }: Readonly<ContactTypeBadgeProps>) {
  if (!typeKey) return null;
  const type = types?.find((t) => t.key === typeKey);
  const token = type?.colorToken ?? 'slate';
  const label = type ? `${type.name}${type.isActive ? '' : ' (inactive)'}` : typeKey;

  return (
    <Badge
      variant="outline"
      className={`gap-1.5 border-transparent font-medium ${contactTypeBadgeClass(token)}`}
      data-testid="contact-type-badge"
    >
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${contactTypeSwatchClass(token)}`}
        aria-hidden="true"
      />
      {label}
    </Badge>
  );
}
