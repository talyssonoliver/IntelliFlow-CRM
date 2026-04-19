'use client';

import { useCallback, useState } from 'react';
import { Card, Badge, Input, Button } from '@intelliflow/ui';
import { SectionHeader } from './SectionHeader';

export interface FileTypesValue {
  allowedExtensions: string[];
  blockedExtensions: string[];
  allowedMimeTypes: string[];
}

interface FileTypesSectionProps {
  value: FileTypesValue;
  onChange: (next: FileTypesValue) => void;
}

export function FileTypesSection({ value, onChange }: Readonly<FileTypesSectionProps>) {
  const [newAllowed, setNewAllowed] = useState('');
  const [newBlocked, setNewBlocked] = useState('');

  const addAllowed = useCallback(() => {
    const ext = newAllowed.trim().toLowerCase().replace(/^\./, '');
    if (!ext || value.allowedExtensions.includes(ext)) return;
    onChange({ ...value, allowedExtensions: [...value.allowedExtensions, ext] });
    setNewAllowed('');
  }, [newAllowed, value, onChange]);

  const removeAllowed = useCallback(
    (ext: string) => {
      onChange({
        ...value,
        allowedExtensions: value.allowedExtensions.filter((e) => e !== ext),
      });
    },
    [value, onChange]
  );

  const addBlocked = useCallback(() => {
    const ext = newBlocked.trim().toLowerCase().replace(/^\./, '');
    if (!ext || value.blockedExtensions.includes(ext)) return;
    onChange({ ...value, blockedExtensions: [...value.blockedExtensions, ext] });
    setNewBlocked('');
  }, [newBlocked, value, onChange]);

  const removeBlocked = useCallback(
    (ext: string) => {
      onChange({
        ...value,
        blockedExtensions: value.blockedExtensions.filter((e) => e !== ext),
      });
    },
    [value, onChange]
  );

  return (
    <Card className="lg:col-span-8 p-4 sm:p-6">
      <SectionHeader
        icon="description"
        iconBg="bg-blue-100 dark:bg-blue-900/30"
        iconFg="text-blue-600 dark:text-blue-400"
        title="File Types"
        description="Configure which file extensions are allowed or blocked on upload."
      />

      <div className="space-y-6">
        <div>
          <h4 className="text-sm font-medium mb-2">Allowed extensions</h4>
          <div className="flex flex-wrap gap-2 mb-3" data-testid="allowed-list">
            {value.allowedExtensions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No allowed extensions configured.</p>
            ) : (
              value.allowedExtensions.map((ext) => (
                <Badge
                  key={ext}
                  variant="secondary"
                  className="gap-1"
                  data-testid={`allowed-${ext}`}
                >
                  .{ext}
                  <button
                    type="button"
                    onClick={() => removeAllowed(ext)}
                    aria-label={`Remove .${ext}`}
                    className="ml-1 hover:text-destructive"
                  >
                    ×
                  </button>
                </Badge>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Input
              aria-label="Add allowed extension"
              placeholder="e.g. pdf"
              value={newAllowed}
              onChange={(e) => setNewAllowed(e.target.value)}
              className="max-w-[200px]"
            />
            <Button type="button" variant="outline" onClick={addAllowed}>
              Add
            </Button>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Blocked extensions</h4>
          <div className="flex flex-wrap gap-2 mb-3" data-testid="blocked-list">
            {value.blockedExtensions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No blocked extensions.</p>
            ) : (
              value.blockedExtensions.map((ext) => (
                <Badge
                  key={ext}
                  variant="destructive"
                  className="gap-1"
                  data-testid={`blocked-${ext}`}
                >
                  .{ext}
                  <button
                    type="button"
                    onClick={() => removeBlocked(ext)}
                    aria-label={`Remove .${ext}`}
                    className="ml-1"
                  >
                    ×
                  </button>
                </Badge>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Input
              aria-label="Add blocked extension"
              placeholder="e.g. exe"
              value={newBlocked}
              onChange={(e) => setNewBlocked(e.target.value)}
              className="max-w-[200px]"
            />
            <Button type="button" variant="outline" onClick={addBlocked}>
              Add
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
