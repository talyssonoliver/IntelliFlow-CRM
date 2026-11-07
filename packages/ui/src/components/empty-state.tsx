'use client';

import * as React from 'react';
import { cn } from '../lib/utils';
import { Button } from './button';
import { Textarea } from './textarea';
import { Input } from './input';
import {
  ENTITY_EMPTY_STATE_CONFIG,
  type EmptyStateEntity,
  type EmptyStateVariant,
} from './entity-empty-state-config';
import { ENTITY_ILLUSTRATIONS } from './empty-state-illustrations';
import { useEmptyStateMachine, type EmptyStatePhase } from '../hooks/use-empty-state-machine';

// ============================================
// Types
// ============================================

export interface EmptyStateAction {
  /** Button label */
  label: string;
  /** Click handler */
  onClick?: () => void;
  /** Link href (renders as anchor) */
  href?: string;
  /** Icon to show in button */
  icon?: string;
}

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * CRM entity type. When provided, auto-configures illustration, title,
   * description, CTA, suggestions, and hotkey from the entity config.
   * All auto-configured values can be overridden via explicit props.
   */
  entity?: EmptyStateEntity;
  /** 'empty' (default) = no items exist, 'selection' = nothing selected in list-detail view */
  variant?: EmptyStateVariant;

  /** Material Symbols icon name (legacy mode — ignored when entity is set) */
  icon?: string;
  /** Main title text */
  title?: string;
  /** Description text */
  description?: string;
  /** Primary action button (legacy mode) */
  action?: EmptyStateAction;
  /** Secondary action button (legacy mode) */
  secondaryAction?: EmptyStateAction;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Icon color class (legacy mode) */
  iconColorClass?: string;
  /** Icon background class (legacy mode) */
  iconBgClass?: string;

  /** Custom illustration JSX — overrides auto-detected SVG */
  illustration?: React.ReactNode;
  /** Override CTA label (entity mode) */
  ctaLabel?: string;
  /** Called when inline composer submits (entity mode) */
  onCreate?: (value: string) => void;
  /** Smart suggestions after first item (entity mode) */
  suggestions?: string[];
  /** Called when a suggestion chip is clicked */
  onSuggestionClick?: (suggestion: string) => void;
  /** Override composer placeholder */
  composerPlaceholder?: string;
  /** Custom composer renderer */
  renderComposer?: (props: {
    onSubmit: (value: string) => void;
    onCancel: () => void;
    placeholder: string;
  }) => React.ReactNode;
  /**
   * Whether this empty state offers a create action (entity mode). `false`
   * marks a read-only screen (#1222 UI-002): a log, a search result, analytics
   * output. It then renders static: not focusable, no hover lifecycle, no
   * hotkey. `action` may still add one button, e.g. "Clear filters".
   * Defaults to true.
   */
  showCta?: boolean;
  /** Navigable empty state: the CTA links here instead of opening the composer. */
  ctaHref?: string;
  /** Creatable empty state: the CTA (and hotkey) run the screen's real create flow. */
  onCtaClick?: () => void;
  /** Controlled phase (entity mode) */
  phase?: EmptyStatePhase;
  /** Phase change callback */
  onPhaseChange?: (phase: EmptyStatePhase) => void;
}

// ============================================
// Size configurations (legacy icon mode)
// ============================================

const sizeConfig = {
  sm: {
    container: 'py-6 px-4',
    iconWrapper: 'h-10 w-10',
    icon: 'text-xl',
    title: 'text-sm font-medium',
    description: 'text-xs',
    gap: 'gap-2',
  },
  md: {
    container: 'py-10 px-6',
    iconWrapper: 'h-14 w-14',
    icon: 'text-2xl',
    title: 'text-base font-semibold',
    description: 'text-sm',
    gap: 'gap-3',
  },
  lg: {
    container: 'py-16 px-8',
    iconWrapper: 'h-20 w-20',
    icon: 'text-4xl',
    title: 'text-xl font-bold',
    description: 'text-base',
    gap: 'gap-4',
  },
};

// ============================================
// Action Button (legacy mode)
// ============================================

function ActionButton({
  action,
  variant = 'default',
}: Readonly<{
  action: EmptyStateAction;
  variant?: 'default' | 'outline';
}>) {
  const buttonContent = (
    <>
      {action.icon && (
        <span className="material-symbols-outlined text-lg mr-1.5" aria-hidden="true">
          {action.icon}
        </span>
      )}
      {action.label}
    </>
  );

  if (action.href) {
    return (
      <Button variant={variant} asChild>
        <a href={action.href}>{buttonContent}</a>
      </Button>
    );
  }

  return (
    <Button variant={variant} onClick={action.onClick}>
      {buttonContent}
    </Button>
  );
}

// ============================================
// Inline Composer (entity mode)
// ============================================

function InlineComposer({
  entity,
  placeholder,
  onSubmit,
  onCancel,
}: Readonly<{
  entity: EmptyStateEntity;
  placeholder: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}>) {
  const [value, setValue] = React.useState('');
  const inputRef = React.useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const usesTextarea = ['notes', 'chats', 'activity', 'timeline'].includes(entity);

  return (
    <div className="w-full max-w-md space-y-3 animate-fade-in">
      {usesTextarea ? (
        <Textarea
          ref={inputRef as React.Ref<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={3}
          className="resize-none"
        />
      ) : (
        <Input
          ref={inputRef as React.Ref<HTMLInputElement>}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!value.trim()}>
          <span className="material-symbols-outlined text-base mr-1" aria-hidden="true">
            add
          </span>
          Create
        </Button>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        <kbd className="px-1 py-0.5 rounded bg-muted text-xs font-mono">Ctrl+Enter</kbd> submit
        {' · '}
        <kbd className="px-1 py-0.5 rounded bg-muted text-xs font-mono">Esc</kbd> cancel
      </p>
    </div>
  );
}

// ============================================
// Suggestion Chips (entity mode)
// ============================================

function SuggestionChips({
  suggestions,
  onSuggestionClick,
}: Readonly<{
  suggestions: string[];
  onSuggestionClick?: (suggestion: string) => void;
}>) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 animate-fade-in">
      <p className="w-full text-center text-sm font-medium text-foreground mb-1">
        What&apos;s next?
      </p>
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onSuggestionClick?.(suggestion)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
            'text-sm text-primary bg-primary/10 border border-primary/20',
            'hover:bg-primary/20 hover:border-primary/30 transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          )}
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            add_circle
          </span>
          {suggestion}
        </button>
      ))}
    </div>
  );
}

// ============================================
// Entity-aware illustration renderer
// ============================================

function EntityIllustration({
  entity,
  phase,
  custom,
}: Readonly<{
  entity: EmptyStateEntity;
  phase: EmptyStatePhase;
  custom?: React.ReactNode;
}>) {
  if (custom) return <>{custom}</>;
  const Illustration = ENTITY_ILLUSTRATIONS[entity];
  if (!Illustration) return null;
  const isReduced = phase === 'inline-composer' || phase === 'smart-suggestions';
  return <Illustration width={isReduced ? 80 : 180} height={isReduced ? 70 : 160} />;
}

// ============================================
// EmptyState Component (unified)
// ============================================

/** Read-only empty states never leave the resting phase. */
const STATIC_PHASE: EmptyStatePhase = 'passive';

/** Read-only and link CTAs take no hotkey: there is nothing to open here. */
function hotkeyEnabled(state: {
  hasEntity: boolean;
  offersCta: boolean;
  ctaHref?: string;
  phase: EmptyStatePhase;
}): boolean {
  if (!state.hasEntity || !state.offersCta || state.ctaHref) return false;
  return state.phase === 'passive' || state.phase === 'soft-cta';
}

/** Title and description: explicit props, then the variant's text, then the entity's. */
function resolveEntityText(
  entity: EmptyStateEntity,
  variant: EmptyStateVariant,
  title: string | undefined,
  description: string | undefined
): { title: string; description: string } {
  const defaults = ENTITY_EMPTY_STATE_CONFIG[entity];
  const variantText = variant === 'empty' ? undefined : defaults.variants?.[variant];
  return {
    title: title ?? variantText?.title ?? defaults.title,
    description: description ?? variantText?.description ?? defaults.description,
  };
}

/** A handler that moves `from` → `to`, and does nothing in any other phase. */
function phaseMover(
  phase: EmptyStatePhase,
  from: EmptyStatePhase,
  to: EmptyStatePhase,
  setPhase: (next: EmptyStatePhase) => void
): () => void {
  return () => {
    if (phase === from) setPhase(to);
  };
}

/** Forward a node to the caller's ref and to the state machine's observer. */
function mergeRefs(
  ref: React.ForwardedRef<HTMLDivElement>,
  observe: (node: HTMLDivElement | null) => void
): (node: HTMLDivElement | null) => void {
  return (node) => {
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
    observe(node);
  };
}

/** The screen's own create flow when it gave one, else the inline composer. */
function createStarter(
  onCtaClick: (() => void) | undefined,
  machine: ReturnType<typeof useEmptyStateMachine>,
  controlledPhase: EmptyStatePhase | undefined,
  onPhaseChange: ((phase: EmptyStatePhase) => void) | undefined
): () => void {
  if (onCtaClick) return onCtaClick;
  return () => applyPhase('inline-composer', machine, controlledPhase, onPhaseChange);
}

/** Report a phase change and, when uncontrolled, move the state machine. */
function applyPhase(
  next: EmptyStatePhase,
  machine: ReturnType<typeof useEmptyStateMachine>,
  controlledPhase: EmptyStatePhase | undefined,
  onPhaseChange: ((phase: EmptyStatePhase) => void) | undefined
) {
  onPhaseChange?.(next);
  if (controlledPhase) return;
  if (next === 'passive') machine.reset();
  // activate() only leaves passive, so step through it: Cancel in the
  // composer must come back to the CTA.
  else if (next === 'soft-cta') {
    machine.reset();
    machine.activate();
  } else if (next === 'inline-composer') machine.openComposer();
  else if (next === 'smart-suggestions') machine.completeCreate();
}

/** The soft-CTA: a link (navigable) or a button (create), plus the hotkey hint. */
function EntityCta({
  label,
  href,
  hotkey,
  onClick,
}: Readonly<{ label: string; href?: string; hotkey?: string; onClick: () => void }>) {
  return (
    <div className="animate-fade-in">
      {href ? (
        <Button size="sm" asChild>
          <a href={href}>
            <span className="material-symbols-outlined text-base mr-1.5" aria-hidden="true">
              arrow_forward
            </span>
            {label}
          </a>
        </Button>
      ) : (
        <Button onClick={onClick} size="sm">
          <span className="material-symbols-outlined text-base mr-1.5" aria-hidden="true">
            add
          </span>
          {label}
        </Button>
      )}
      {hotkey && !href && (
        <p className="text-xs text-muted-foreground mt-2">
          or press{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono font-medium">
            {hotkey}
          </kbd>
        </p>
      )}
    </div>
  );
}

/**
 * Listens for the entity hotkey while `enabled`. Typing in a field never
 * triggers it; the latest `onTrigger` is always used.
 */
function useEntityHotkey(enabled: boolean, hotkey: string | null, onTrigger: () => void) {
  const triggerRef = React.useRef(onTrigger);
  triggerRef.current = onTrigger;

  React.useEffect(() => {
    if (!enabled || !hotkey) return;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      if (e.key.toUpperCase() !== hotkey.toUpperCase() || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      e.preventDefault();
      triggerRef.current();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled, hotkey]);
}

interface ReadOnlyEntityEmptyStateProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'title'
> {
  entity: EmptyStateEntity;
  title?: string;
  description?: string;
  variant: EmptyStateVariant;
  illustration?: React.ReactNode;
  action?: EmptyStateAction;
}

/**
 * Read-only entity empty state (#1222 UI-002): a labelled region that is not a
 * tab stop, with no hover lifecycle; at most one action (e.g. Clear filters).
 */
const ReadOnlyEntityEmptyState = React.forwardRef<HTMLDivElement, ReadOnlyEntityEmptyStateProps>(
  ({ entity, variant, title, description, illustration, action, className, ...props }, ref) => {
    const text = resolveEntityText(entity, variant, title, description);
    return (
      <div
        ref={ref}
        role="region"
        aria-label={`${entity} empty state`}
        data-empty-state="read-only"
        className={cn(
          'flex flex-col items-center justify-center text-center',
          'py-12 px-6 gap-4 rounded-lg',
          className
        )}
        {...props}
      >
        <EntityIllustration entity={entity} phase={STATIC_PHASE} custom={illustration} />
        <h3 className="text-lg font-semibold text-foreground">{text.title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">{text.description}</p>
        {action && <ActionButton action={action} variant="outline" />}
      </div>
    );
  }
);
ReadOnlyEntityEmptyState.displayName = 'ReadOnlyEntityEmptyState';

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      // Entity mode props
      entity,
      variant = 'empty',
      illustration,
      ctaLabel: ctaLabelProp,
      onCreate,
      suggestions: suggestionsProp,
      onSuggestionClick,
      composerPlaceholder: placeholderProp,
      renderComposer,
      phase: controlledPhase,
      onPhaseChange,
      showCta: offersCta = true,
      ctaHref,
      onCtaClick,
      // Legacy/shared props
      icon = 'inbox',
      title: titleProp,
      description: descriptionProp,
      action,
      secondaryAction,
      size = 'md',
      iconColorClass = 'text-muted-foreground',
      iconBgClass = 'bg-muted',
      className,
      ...props
    },
    ref
  ) => {
    // -----------------------------------------------------------
    // Hooks must always be called unconditionally (Rules of Hooks)
    // -----------------------------------------------------------
    const machine = useEmptyStateMachine();

    const defaults = entity ? ENTITY_EMPTY_STATE_CONFIG[entity] : null;
    const phase = controlledPhase ?? machine.phase;
    const hotkey = defaults?.hotkey ?? null;

    // The CTA and the hotkey both start a create: the screen's own flow when it
    // gave one, else the inline composer.
    const startCreate = createStarter(onCtaClick, machine, controlledPhase, onPhaseChange);
    useEntityHotkey(
      hotkeyEnabled({ hasEntity: Boolean(entity), offersCta, ctaHref, phase }),
      hotkey,
      startCreate
    );

    // -----------------------------------------------------------
    // ENTITY MODE — rich illustrations with lifecycle
    // -----------------------------------------------------------
    if (entity && !offersCta) {
      return (
        <ReadOnlyEntityEmptyState
          ref={ref}
          entity={entity}
          variant={variant}
          title={titleProp}
          description={descriptionProp}
          illustration={illustration}
          action={action}
          className={className}
          {...props}
        />
      );
    }

    if (entity && defaults) {
      const setPhase = (next: EmptyStatePhase) =>
        applyPhase(next, machine, controlledPhase, onPhaseChange);

      const { title, description } = resolveEntityText(entity, variant, titleProp, descriptionProp);
      const ctaLabel = ctaLabelProp ?? defaults.ctaLabel;
      const suggestions = suggestionsProp ?? defaults.suggestions;
      const composerPlaceholder = placeholderProp ?? defaults.composerPlaceholder;

      const moveFrom = (from: EmptyStatePhase, to: EmptyStatePhase) =>
        phaseMover(phase, from, to, setPhase);
      const handleMouseEnter = moveFrom('passive', 'soft-cta');
      const handleMouseLeave = moveFrom('soft-cta', 'passive');
      const handleFocus = moveFrom('passive', 'soft-cta');
      const handleCtaClick = startCreate;
      const handleComposerSubmit = (v: string) => {
        onCreate?.(v);
        setPhase('smart-suggestions');
      };
      const handleComposerCancel = () => setPhase('soft-cta');

      const showIllustration = phase !== 'smart-suggestions';
      const showDescription = phase === 'passive' || phase === 'soft-cta';
      const showCta = phase === 'soft-cta';
      const showComposer = phase === 'inline-composer';
      const showSuggestions = phase === 'smart-suggestions';

      return (
        <div
          ref={mergeRefs(ref, machine.observerRef)}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onFocus={handleFocus}
          role="region"
          aria-label={`${entity} empty state`}
          tabIndex={0}
          className={cn(
            'flex flex-col items-center justify-center text-center',
            'py-12 px-6 gap-4 rounded-lg',
            'transition-all duration-300 ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            className
          )}
          {...props}
        >
          {showIllustration && (
            <div
              className={cn(
                'transition-all duration-300 ease-out',
                phase === 'soft-cta' && 'opacity-80',
                phase === 'inline-composer' && 'scale-75 opacity-60'
              )}
            >
              <EntityIllustration entity={entity} phase={phase} custom={illustration} />
            </div>
          )}

          <h3
            className={cn(
              'text-lg font-semibold text-foreground transition-all duration-200',
              (showComposer || showSuggestions) && 'text-base'
            )}
          >
            {showSuggestions ? 'Great start!' : title}
          </h3>

          {showDescription && (
            <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
          )}

          {showCta && (
            <EntityCta
              label={ctaLabel}
              href={ctaHref}
              hotkey={defaults.hotkey}
              onClick={handleCtaClick}
            />
          )}

          {showComposer &&
            (renderComposer ? (
              renderComposer({
                onSubmit: handleComposerSubmit,
                onCancel: handleComposerCancel,
                placeholder: composerPlaceholder,
              })
            ) : (
              <InlineComposer
                entity={entity}
                placeholder={composerPlaceholder}
                onSubmit={handleComposerSubmit}
                onCancel={handleComposerCancel}
              />
            ))}

          {showSuggestions && suggestions.length > 0 && (
            <SuggestionChips suggestions={suggestions} onSuggestionClick={onSuggestionClick} />
          )}
        </div>
      );
    }

    // -----------------------------------------------------------
    // LEGACY MODE — icon in circle with action buttons
    // -----------------------------------------------------------
    const config = sizeConfig[size];

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center text-center',
          config.container,
          config.gap,
          className
        )}
        {...props}
      >
        <div
          className={cn(
            'rounded-full flex items-center justify-center',
            config.iconWrapper,
            iconBgClass
          )}
        >
          <span
            className={cn('material-symbols-outlined', config.icon, iconColorClass)}
            aria-hidden="true"
          >
            {icon}
          </span>
        </div>

        <div className={cn('flex flex-col', config.gap)}>
          <h3 className={cn(config.title, 'text-foreground')}>{titleProp}</h3>
          {descriptionProp && (
            <p className={cn(config.description, 'text-muted-foreground max-w-sm')}>
              {descriptionProp}
            </p>
          )}
        </div>

        {(action || secondaryAction) && (
          <div className="flex items-center gap-2 mt-2">
            {action && <ActionButton action={action} variant="default" />}
            {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}
          </div>
        )}
      </div>
    );
  }
);

EmptyState.displayName = 'EmptyState';

// ============================================
// Exports
// ============================================

export { EmptyState };

/**
 * @deprecated Use `EmptyState` with `entity` prop instead.
 */
export const SharedEmptyState = EmptyState;
