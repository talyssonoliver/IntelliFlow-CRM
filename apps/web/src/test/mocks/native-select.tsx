/**
 * Native <select> stand-in for the Radix-based `@intelliflow/ui` Select family,
 * for jsdom tests that need to pick an option (Radix portals and pointer
 * capture are not reliable in jsdom). The trigger's `id`, `aria-label`,
 * `aria-invalid` and `aria-describedby` are moved onto the native select, so
 * `<Label htmlFor>` and accessible-name queries keep working.
 *
 * Usage:
 *   vi.mock('@intelliflow/ui', async (orig) => ({
 *     ...(await orig()),
 *     ...(await import('@/test/mocks/native-select')).nativeSelectMock,
 *   }));
 */
import * as React from 'react';

interface SelectCtx {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  trigger: Record<string, unknown>;
}

const Ctx = React.createContext<SelectCtx | null>(null);

function Select({
  value,
  onValueChange,
  disabled,
  children,
}: Readonly<{
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}>) {
  const trigger = React.useRef<Record<string, unknown>>({}).current;
  return (
    <Ctx.Provider
      value={{ value: value ?? '', onValueChange: onValueChange ?? (() => {}), disabled, trigger }}
    >
      {children}
    </Ctx.Provider>
  );
}

function SelectTrigger(props: Readonly<Record<string, unknown>>) {
  const ctx = React.useContext(Ctx);
  if (ctx) Object.assign(ctx.trigger, props, { children: undefined });
  return null;
}

function SelectValue() {
  return null;
}

function SelectContent({ children }: Readonly<{ children: React.ReactNode }>) {
  const ctx = React.useContext(Ctx);
  if (!ctx) return null;
  const { id, className } = ctx.trigger as { id?: string; className?: string };
  return (
    <select
      id={id}
      className={className}
      aria-label={ctx.trigger['aria-label'] as string | undefined}
      aria-invalid={ctx.trigger['aria-invalid'] as boolean | undefined}
      aria-describedby={ctx.trigger['aria-describedby'] as string | undefined}
      value={ctx.value}
      disabled={ctx.disabled}
      onChange={(e) => ctx.onValueChange(e.target.value)}
    >
      {children}
    </select>
  );
}

function SelectItem({ value, children }: Readonly<{ value: string; children: React.ReactNode }>) {
  return <option value={value}>{children}</option>;
}

export const nativeSelectMock = { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
