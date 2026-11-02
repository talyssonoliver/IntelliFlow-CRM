'use client';

// Webhook credentials — PG-208 (AC-TA-006, AC-TA-017). Shown once after a
// webhook rule is created, its secret rotated or its URL regenerated. The values
// live only in the parent's component state, never in a toast or the query
// cache; the dialog cannot be dismissed by an outside click (so a stray click
// does not lose them), while Esc and Done close it.

import { useState } from 'react';
import { TASK_AUTOMATION_LIMITS } from '@intelliflow/domain';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from '@intelliflow/ui';
import type { TaskAutomationWebhookCredentials } from '@intelliflow/validators';
import { CopyField } from '@/components/shared/copy-field';

const L = TASK_AUTOMATION_LIMITS;

export interface WebhookSecretDialogProps {
  readonly credentials: TaskAutomationWebhookCredentials | null;
  readonly ruleName: string;
  readonly onClose: () => void;
}

function SigningInstructions() {
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">How to call the webhook</p>
      <p>
        Send a <code>POST</code> with a JSON body (up to {L.webhookBodyMaxBytes / 1024} KB) and
        these headers:
      </p>
      <ul className="list-disc space-y-1 pl-4">
        <li>
          <code>Idempotency-Key: &lt;key&gt;</code>, unique per event (letters, digits,{' '}
          <code>. _ : -</code>, up to {L.idempotencyKeyMax}).
        </li>
        <li>
          <code>X-IntelliFlow-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code>, where{' '}
          <code>&lt;hex&gt;</code> is the HMAC-SHA256 of{' '}
          <code>&lt;unix&gt;.&lt;key&gt;.&lt;body&gt;</code> using <code>&lt;secret&gt;</code>.
        </li>
      </ul>
      <p>
        <code>&lt;unix&gt;</code> must be within {L.webhookSkewSeconds / 60} minutes of now. A
        repeated key with the same body creates nothing new.
      </p>
    </div>
  );
}

export function WebhookSecretDialog({ credentials, ruleName, onClose }: WebhookSecretDialogProps) {
  const open = credentials !== null;
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-xl" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Webhook for “{ruleName}”</DialogTitle>
          <DialogDescription>
            Copy these now. They are shown only once and cannot be shown again; if you lose them,
            rotate the secret or create a new URL.
          </DialogDescription>
        </DialogHeader>
        {credentials?.webhookUrl && (
          <CopyField
            id="webhook-url"
            label="Webhook URL"
            value={credentials.webhookUrl}
            help="Anyone with this URL can try to call the rule; requests still need the signature."
          />
        )}
        {credentials?.signingSecret && (
          <CopyField
            id="webhook-secret"
            label="Signing secret"
            value={credentials.signingSecret}
            help="Store it in the sending system’s secret manager."
          />
        )}
        <SigningInstructions />
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface RotateSecretDialogProps {
  /** Rule whose secret is rotated; null closes the dialog. */
  readonly ruleName: string | null;
  readonly isPending: boolean;
  readonly onConfirm: (revokePrevious: boolean) => void;
  readonly onCancel: () => void;
}

export function RotateSecretDialog({
  ruleName,
  isPending,
  onConfirm,
  onCancel,
}: RotateSecretDialogProps) {
  const [revoke, setRevoke] = useState(false);
  return (
    <Dialog
      open={ruleName !== null}
      onOpenChange={(next) => {
        if (!next) {
          setRevoke(false);
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rotate the signing secret?</DialogTitle>
          <DialogDescription>
            “{ruleName ?? ''}” gets a new secret, shown once. Unless you revoke it now, the old
            secret keeps working for {L.webhookSecretGraceHours} hours so senders can switch.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Checkbox
            id="rotate-revoke"
            checked={revoke}
            onCheckedChange={(v) => setRevoke(v === true)}
          />
          <Label htmlFor="rotate-revoke" className="font-normal">
            Revoke the old secret now
          </Label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm(revoke)} disabled={isPending}>
            Rotate Secret
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
