'use client';

import { useState, useCallback, useRef } from 'react';

export interface UseComplementarySidebarReturn<T> {
  /** Whether the sidebar is currently open */
  isOpen: boolean;
  /** The currently selected item, or null when nothing is selected */
  selectedItem: T | null;
  /** Content key for crossfade animation — pass to ComplementarySidebar.contentKey */
  contentKey: string;
  /** Open the sidebar with the given item. Pass a stable key for same-item detection. */
  open: (item: T, key?: string) => void;
  /** Close the sidebar (selected item is preserved for slide-out animation) */
  close: () => void;
  /** Toggle: if same key is currently active, close; otherwise open with new item */
  toggle: (item: T, key?: string) => void;
}

/**
 * Manages open/close state and item selection for a ComplementarySidebar.
 *
 * @example
 * ```tsx
 * const sidebar = useComplementarySidebar<Agent>();
 *
 * <button onClick={() => sidebar.toggle(agent, agent.id)}>
 *   {agent.name}
 * </button>
 *
 * <ComplementarySidebar
 *   isOpen={sidebar.isOpen}
 *   onClose={sidebar.close}
 *   contentKey={sidebar.contentKey}
 *   title={sidebar.selectedItem?.name}
 * >
 *   <AgentDetails agent={sidebar.selectedItem} />
 * </ComplementarySidebar>
 * ```
 */
export function useComplementarySidebar<T>(): UseComplementarySidebarReturn<T> {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [contentKey, setContentKey] = useState('');
  const keyCounterRef = useRef(0);
  const currentKeyRef = useRef('');

  const open = useCallback((item: T, key?: string) => {
    const newKey = key ?? `cs-${++keyCounterRef.current}`;
    currentKeyRef.current = newKey;
    setSelectedItem(item);
    setContentKey(newKey);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback((item: T, key?: string) => {
    const newKey = key ?? `cs-${++keyCounterRef.current}`;
    if (key != null && key === currentKeyRef.current) {
      setIsOpen((prev) => !prev);
    } else {
      currentKeyRef.current = newKey;
      setSelectedItem(item);
      setContentKey(newKey);
      setIsOpen(true);
    }
  }, []);

  return { isOpen, selectedItem, contentKey, open, close, toggle };
}
