'use client';

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import * as React from 'react';
import { api } from '@/lib/api';

export interface CalendarLayer {
  id: string;
  label: string;
  color: string;
  checked: boolean;
  /** Whether this is a built-in calendar (cannot be removed) */
  isDefault: boolean;
}

/** DB-backed custom calendar record */
export interface DbCalendar {
  id: string;
  name: string;
  color: string;
  ownerId: string;
  createdAt: Date;
}

interface CalendarVisibilityContextValue {
  calendars: CalendarLayer[];
  /** DB-backed custom calendars (for use in form dropdowns) */
  dbCalendars: DbCalendar[];
  toggle: (id: string) => void;
  isVisible: (id: string) => boolean;
  /** Show only the specified calendar IDs, hiding all others */
  setOnlyVisible: (ids: string[]) => void;
  addCalendar: (label: string, color: string) => Promise<void>;
  removeCalendar: (id: string) => Promise<void>;
}

const VISIBILITY_KEY = 'calendar-visibility';

export interface CustomCalendarEntry {
  id: string;
  label: string;
  color: string;
}

const DEFAULT_CALENDARS: readonly {
  id: string;
  label: string;
  color: string;
  defaultChecked: boolean;
}[] = [
  { id: 'personal', label: 'Personal', color: '#3b82f6', defaultChecked: true },
  { id: 'team', label: 'Team Events', color: '#22c55e', defaultChecked: true },
  { id: 'tasks', label: 'Tasks', color: '#14b8a6', defaultChecked: true },
  { id: 'holidays', label: 'Holidays', color: '#94a3b8', defaultChecked: false },
];

/** Colors available for new custom calendars */
export const CALENDAR_COLOR_OPTIONS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#ef4444', // red
  '#a855f7', // purple
  '#ec4899', // pink
  '#f97316', // orange
];

function loadJson<T>(key: string): T | null {
  if (typeof globalThis.window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : null;
  } catch {
    return null;
  }
}

function getDefaultVisibility(): Record<string, boolean> {
  return Object.fromEntries(DEFAULT_CALENDARS.map((c) => [c.id, c.defaultChecked]));
}

/** Typed escape-hatch for the calendar tRPC namespace */
interface CalendarApiEscape {
  calendar?: {
    list?: {
      useQuery?: (
        params?: undefined,
        opts?: { staleTime?: number; enabled?: boolean }
      ) => { data: unknown; isLoading: boolean };
    };
    create?: {
      useMutation?: (opts?: Record<string, unknown>) => {
        mutateAsync: (data: { name: string; color: string }) => Promise<unknown>;
      };
    };
    delete?: {
      useMutation?: (opts?: Record<string, unknown>) => {
        mutateAsync: (data: { id: string }) => Promise<unknown>;
      };
    };
  };
}

 
const calendarApi = api as CalendarApiEscape;

const CalendarVisibilityContext = createContext<CalendarVisibilityContextValue | null>(null);

export function CalendarVisibilityProvider({ children }: { children: ReactNode }) {
  // Always initialize with defaults to match server render and avoid hydration mismatch.
  // localStorage values are applied in the useEffect below after hydration.
  const [visibility, setVisibility] = useState<Record<string, boolean>>(getDefaultVisibility);
  const hasExternalOverride = useRef(false);

  // Hydrate from localStorage after mount to avoid SSR/client mismatch
  useEffect(() => {
    if (hasExternalOverride.current) return;
    const stored = loadJson<Record<string, boolean>>(VISIBILITY_KEY);
    if (stored) {
      setVisibility(stored);
    }
  }, []);

  // DB-backed custom calendars
  const { data: rawDbCalendars } = calendarApi.calendar?.list?.useQuery?.(undefined, {
    staleTime: 60_000,
  }) ?? { data: undefined };

  const dbCalendars: DbCalendar[] = useMemo(() => {
    if (!rawDbCalendars) return [];
    return (rawDbCalendars as DbCalendar[]).map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      ownerId: c.ownerId,
      createdAt: new Date(c.createdAt),
    }));
  }, [rawDbCalendars]);

  const createMutation = calendarApi.calendar?.create?.useMutation?.({
    onSuccess: () => {
      // Invalidation happens via tRPC queryClient
    },
  });

  const deleteMutation = calendarApi.calendar?.delete?.useMutation?.({
    onSuccess: () => {
      // Invalidation happens via tRPC queryClient
    },
  });

  // Persist visibility toggles to localStorage
  useEffect(() => {
    if (typeof globalThis.window === 'undefined') return;
    localStorage.setItem(VISIBILITY_KEY, JSON.stringify(visibility));
  }, [visibility]);

  const toggle = useCallback((id: string) => {
    setVisibility((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const isVisible = useCallback((id: string): boolean => visibility[id] ?? true, [visibility]);

  const setOnlyVisible = useCallback((ids: string[]) => {
    hasExternalOverride.current = true;
    const idSet = new Set(ids);
    setVisibility((prev) => {
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) {
        next[key] = idSet.has(key);
      }
      // Ensure requested ids are visible even if not in prev
      for (const id of ids) {
        next[id] = true;
      }
      return next;
    });
  }, []);

  const addCalendar = useCallback(
    (label: string, color: string): Promise<void> => {
      return createMutation
        ?.mutateAsync({ name: label, color })
        .then((result) => {
          if (result) {
            const created = result as DbCalendar;
            setVisibility((prev) => ({ ...prev, [created.id]: true }));
          }
        })
        .catch(() => {
          // Silently fail — the UI can retry
        }) ?? Promise.resolve();
    },
    [createMutation]
  );

  const removeCalendar = useCallback(
    (id: string): Promise<void> => {
      return deleteMutation
        ?.mutateAsync({ id })
        .then(() => {
          setVisibility((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        })
        .catch(() => {
          // Silently fail
        }) ?? Promise.resolve();
    },
    [deleteMutation]
  );

  const calendars: CalendarLayer[] = useMemo(() => {
    const defaults: CalendarLayer[] = DEFAULT_CALENDARS.map((c) => ({
      id: c.id,
      label: c.label,
      color: c.color,
      checked: visibility[c.id] ?? c.defaultChecked,
      isDefault: true,
    }));
    const custom: CalendarLayer[] = dbCalendars.map((c) => ({
      id: c.id,
      label: c.name,
      color: c.color,
      checked: visibility[c.id] ?? true,
      isDefault: false,
    }));
    return [...defaults, ...custom];
  }, [visibility, dbCalendars]);

  const value = useMemo<CalendarVisibilityContextValue>(
    () => ({ calendars, dbCalendars, toggle, isVisible, setOnlyVisible, addCalendar, removeCalendar }),
    [calendars, dbCalendars, toggle, isVisible, setOnlyVisible, addCalendar, removeCalendar]
  );

  return React.createElement(CalendarVisibilityContext.Provider, { value }, children);
}

/** Strict version — throws if no provider. Use for calendar pages. */
export function useCalendarVisibility(): CalendarVisibilityContextValue {
  const ctx = useContext(CalendarVisibilityContext);
  if (!ctx) {
    throw new Error('useCalendarVisibility must be used within a CalendarVisibilityProvider');
  }
  return ctx;
}

const NOOP_ASYNC = async () => {};

/** Graceful version — returns safe defaults when no provider is present. */
export function useCalendarVisibilityOptional(): CalendarVisibilityContextValue {
  const ctx = useContext(CalendarVisibilityContext);
  if (ctx) return ctx;
  return {
    calendars: [],
    dbCalendars: [],
    toggle: () => {},
    isVisible: () => true,
    setOnlyVisible: () => {},
    addCalendar: NOOP_ASYNC,
    removeCalendar: NOOP_ASYNC,
  };
}
