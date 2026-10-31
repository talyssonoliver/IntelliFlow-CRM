'use client';

// Task automation tags — PG-208. The shared settings TagsTab (lifted from PG-201)
// with this page's texts and field ids; forwardRef({ openCreate }) passes through.

import { forwardRef } from 'react';
import {
  TagsTab as SharedTagsTab,
  type TagsTabHandle,
  type TagsTabProps,
  type TagsTabTexts,
} from '@/components/shared/tags-tab';

export type { TagsTabHandle };

const TEXTS: TagsTabTexts = {
  listLabel: 'Automation tags',
  emptyDescription: 'Tags group automation rules, for example by team or process.',
  dialogDescription:
    'Tags group automation rules. The name is required; Create stays disabled until you enter one.',
  idPrefix: 'automation-tag',
};

export const TagsTab = forwardRef<TagsTabHandle, Omit<TagsTabProps, 'texts'>>(
  function TaskAutomationTagsTab(props, ref) {
    return <SharedTagsTab ref={ref} {...props} texts={TEXTS} />;
  }
);
