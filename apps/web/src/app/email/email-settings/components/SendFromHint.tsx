'use client';

/**
 * MVP-001: "Which address do you send from?" Asks the server which provider runs that address's
 * mail (its MX records) and says which one-click button to use; flags a personal address
 * (gmail.com, outlook.com, ...), which customers would see on business email.
 */
import { useEffect, useId, useState } from 'react';
import { Input, Label } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

export type HintProvider = 'GMAIL' | 'MICROSOFT' | 'ZOHO';

const BUTTON: Record<string, { provider: HintProvider; label: string; name: string }> = {
  GOOGLE: { provider: 'GMAIL', label: 'Connect Google', name: 'Google' },
  MICROSOFT: { provider: 'MICROSOFT', label: 'Connect Microsoft', name: 'Microsoft' },
  ZOHO: { provider: 'ZOHO', label: 'Connect Zoho Mail', name: 'Zoho Mail' },
};

/** Looks like an address (the server validates it properly): one @, a dotted domain, no spaces. */
function looksLikeAddress(value: string): boolean {
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@') || value.length > 320 || /\s/.test(value))
    return false;
  const domain = value.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

function providerLine(provider: string, domain: string): string {
  const button = BUTTON[provider];
  if (button) return `Mail for ${domain} is run by ${button.name}. Use ${button.label}.`;
  if (provider === 'OTHER') {
    return `Mail for ${domain} is not run by Google, Microsoft or Zoho. Sending with a password does not work on our servers yet.`;
  }
  return `We could not tell who runs mail for ${domain}. Choose the sign-in your provider offers.`;
}

export function SendFromHint({
  scope,
  onProvider,
}: Readonly<{ scope: 'USER' | 'TENANT'; onProvider: (provider: HintProvider | null) => void }>) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [address, setAddress] = useState<string | null>(null);
  const hint = trpc.emailProviderHint.forAddress.useQuery(
    { address: address ?? '' },
    { enabled: address !== null, retry: false, staleTime: 10 * 60_000 }
  );
  const data = hint.data;

  useEffect(() => {
    onProvider(data ? (BUTTON[data.provider]?.provider ?? null) : null);
  }, [data, onProvider]);

  const check = () => {
    const value = draft.trim().toLowerCase();
    setAddress(looksLikeAddress(value) ? value : null);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {scope === 'TENANT'
          ? 'Which address does the business send from?'
          : 'Which address do you send from?'}
      </Label>
      <Input
        id={id}
        type="email"
        value={draft}
        placeholder="name@yourbusiness.com"
        aria-describedby={data ? `${id}-hint` : undefined}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={check}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            check();
          }
        }}
      />
      {data && (
        <div id={`${id}-hint`} aria-live="polite" className="space-y-1">
          <p className="text-xs text-muted-foreground" data-testid="send-from-provider">
            {providerLine(data.provider, data.domain)}
          </p>
          {data.personal && (
            <p
              className="text-xs text-amber-800 dark:text-amber-200"
              data-testid="send-from-personal"
            >
              {address} is a personal address. Customers will see it on every email
              {scope === 'TENANT' ? ' the business sends' : ' you send from the CRM'}. Use your
              business address if you have one.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
