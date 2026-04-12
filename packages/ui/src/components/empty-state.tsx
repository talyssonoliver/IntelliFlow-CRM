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

    React.useEffect(() => {
      if (!entity) return;
      if (phase !== 'passive' && phase !== 'soft-cta') return;
      if (!hotkey) return;
      const handler = (e: KeyboardEvent) => {
        const t = e.target as HTMLElement;
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
        if (e.key.toUpperCase() === hotkey.toUpperCase() && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          if (onPhaseChange) onPhaseChange('inline-composer');
          if (!controlledPhase) machine.openComposer();
        }
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }, [entity, phase, hotkey, controlledPhase, onPhaseChange, machine]);

    // -----------------------------------------------------------
    // ENTITY MODE — rich illustrations with lifecycle
    // -----------------------------------------------------------
    if (entity && defaults) {
      const setPhase = (next: EmptyStatePhase) => {
        if (onPhaseChange) onPhaseChange(next);
        if (!controlledPhase) {
          if (next === 'passive') machine.reset();
          else if (next === 'soft-cta') machine.activate();
          else if (next === 'inline-composer') machine.openComposer();
          else if (next === 'smart-suggestions') machine.completeCreate();
        }
      };

      const variantText = variant !== 'empty' ? defaults.variants?.[variant] : undefined;
      const title = titleProp ?? variantText?.title ?? defaults.title;
      const description = descriptionProp ?? variantText?.description ?? defaults.description;
      const ctaLabel = ctaLabelProp ?? defaults.ctaLabel;
      const suggestions = suggestionsProp ?? defaults.suggestions;
      const composerPlaceholder = placeholderProp ?? defaults.composerPlaceholder;

      const handleMouseEnter = () => {
        if (phase === 'passive') setPhase('soft-cta');
      };
      const handleMouseLeave = () => {
        if (phase === 'soft-cta') setPhase('passive');
      };
      const handleFocus = () => {
        if (phase === 'passive') setPhase('soft-cta');
      };
      const handleCtaClick = () => setPhase('inline-composer');
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
          ref={(node) => {
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
            machine.observerRef(node);
          }}
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
            <div className="animate-fade-in">
              <Button onClick={handleCtaClick} size="sm">
                <span className="material-symbols-outlined text-base mr-1.5" aria-hidden="true">
                  add
                </span>
                {ctaLabel}
              </Button>
              {defaults.hotkey && (
                <p className="text-xs text-muted-foreground mt-2">
                  or press{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono font-medium">
                    {defaults.hotkey}
                  </kbd>
                </p>
              )}
            </div>
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
