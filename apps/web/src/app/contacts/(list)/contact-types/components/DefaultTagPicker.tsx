'use client';

/**
 * Default tags of a contact type (PG-205 "default labels"): tags from the tenant's
 * Contact Settings tag list, added to new contacts of this type. Real checkboxes in
 * a fieldset; at the cap the unselected ones stay focusable but aria-disabled, with
 * the reason linked and announced (a natively disabled control would hide it from
 * keyboard users).
 */
import { useState } from 'react';
import { Checkbox, Label } from '@intelliflow/ui';
import { CONTACT_TYPE_LIMITS } from '@intelliflow/domain';

export interface DefaultTagOption {
  id: string;
  name: string;
  isActive: boolean;
}

export interface DefaultTagPickerProps {
  tags: readonly DefaultTagOption[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /**
   * Tags the type already links. One of these that was deactivated since stays listed
   * ("(inactive)") so it can be removed or kept; other inactive tags are not offered.
   */
  keptIds?: readonly string[];
}

const HINT_ID = 'contact-type-default-tags-hint';
const MAX = CONTACT_TYPE_LIMITS.maxDefaultTags;

export function DefaultTagPicker({
  tags,
  value,
  onChange,
  disabled = false,
  keptIds = [],
}: Readonly<DefaultTagPickerProps>) {
  const [announcement, setAnnouncement] = useState('');
  const options = tags.filter((t) => t.isActive || keptIds.includes(t.id));
  const atCap = value.length >= MAX;

  const toggle = (id: string, checked: boolean) => {
    if (checked) {
      if (atCap) {
        setAnnouncement(`Maximum of ${MAX} default tags reached.`);
        return;
      }
      onChange([...value, id]);
      return;
    }
    setAnnouncement('');
    onChange(value.filter((v) => v !== id));
  };

  return (
    <fieldset className="space-y-2" aria-describedby={HINT_ID}>
      <legend className="text-sm font-medium text-foreground">Default tags</legend>
      <p id={HINT_ID} className="text-xs text-muted-foreground">
        Added to new contacts of this type. Choose up to {MAX} tags from Contact Settings.
      </p>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tags yet. Create tags in Contact Settings to use them here.
        </p>
      ) : (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {options.map((tag) => {
            const checked = value.includes(tag.id);
            const blocked = atCap && !checked;
            return (
              <div key={tag.id} className="flex min-h-11 items-center gap-2">
                <Checkbox
                  id={`contact-type-tag-${tag.id}`}
                  checked={checked}
                  disabled={disabled}
                  aria-disabled={blocked ? true : undefined}
                  aria-describedby={blocked ? HINT_ID : undefined}
                  className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                  onCheckedChange={(next) => toggle(tag.id, next === true)}
                />
                <Label htmlFor={`contact-type-tag-${tag.id}`}>
                  {tag.name}
                  {tag.isActive ? '' : ' (inactive)'}
                </Label>
              </div>
            );
          })}
        </div>
      )}
      <output className="block text-xs text-muted-foreground">{announcement}</output>
    </fieldset>
  );
}
