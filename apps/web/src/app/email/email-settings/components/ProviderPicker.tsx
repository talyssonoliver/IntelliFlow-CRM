'use client';

/**
 * Step one of mailbox setup: who provides your email. The route for a business
 * address on the customer's own domain comes first, because that is most people.
 */
import { Label, cn } from '@intelliflow/ui';
import {
  MAILBOX_PROVIDERS,
  type MailboxProvider,
  type MailboxProviderId,
} from './mailbox-providers';

const CUSTOM = {
  id: 'custom' as const,
  label: 'My own domain or another provider',
  hint: 'A business address like you@yourcompany.com',
};

export interface ProviderPickerProps {
  /** Group name and the prefix of each option's id. */
  idPrefix: string;
  value: MailboxProviderId | null;
  onChange: (id: MailboxProviderId) => void;
}

function Option({
  id,
  name,
  label,
  hint,
  checked,
  onSelect,
}: Readonly<{
  id: string;
  name: string;
  label: string;
  hint: string;
  checked: boolean;
  onSelect: () => void;
}>) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
        'focus-within:ring-2 focus-within:ring-ring',
        checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </Label>
  );
}

export function ProviderPicker({ idPrefix, value, onChange }: Readonly<ProviderPickerProps>) {
  const name = `${idPrefix}-provider`;
  const option = (p: Pick<MailboxProvider, 'label' | 'hint'> & { id: MailboxProviderId }) => (
    <Option
      key={p.id}
      id={`${name}-${p.id}`}
      name={name}
      label={p.label}
      hint={p.hint}
      checked={value === p.id}
      onSelect={() => onChange(p.id)}
    />
  );
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">Who provides your email?</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {option(CUSTOM)}
        {MAILBOX_PROVIDERS.map(option)}
      </div>
    </fieldset>
  );
}

/** Where to find the settings for a provider the form doesn't know. */
export function CustomProviderGuide() {
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
      <p className="font-medium text-foreground">Using your own domain</p>
      <p className="text-muted-foreground">
        Whoever hosts your email has the details you need: search their help pages for &ldquo;SMTP
        settings&rdquo;, or ask them. It is usually a server name like mail.yourcompany.com and the
        password for your mailbox.
      </p>
      <p className="text-muted-foreground">
        If Google, Microsoft or Zoho runs your email, even on your own domain, choose them above
        instead. It is simpler. Sending-only services work here too: use the server name, sign-in
        name and API key they give you. They have no mailbox to read, so leave bounce reading off.
      </p>
    </div>
  );
}

/** What a known provider needs: its steps, the link to the page, and anything likely to fail. */
export function ProviderGuide({ provider }: Readonly<{ provider: MailboxProvider }>) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
      <p className="font-medium text-foreground">
        {provider.id === 'zoho' || provider.secretLabel !== 'App password'
          ? `What ${provider.name} needs`
          : `${provider.name} needs an app password`}
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        {provider.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {provider.warning ? (
        <p className="text-amber-800 dark:text-amber-300">{provider.warning}</p>
      ) : null}
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        {provider.createLink ? (
          <a
            href={provider.createLink.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-4"
          >
            {provider.createLink.label}
          </a>
        ) : null}
        {provider.secondLink ? (
          <a
            href={provider.secondLink.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4"
          >
            {provider.secondLink.label}
          </a>
        ) : null}
        <a
          href={provider.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4"
        >
          {provider.name} help
        </a>
      </p>
    </div>
  );
}
