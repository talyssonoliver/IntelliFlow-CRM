/**
 * Whether the live-update connection (the tRPC WebSocket) is open right now (MVP-004).
 *
 * The provider's WebSocket client sets it from its onOpen/onClose callbacks; pages read it with
 * useLiveConnection() so a "Live" label is shown only while updates really arrive live. Without a
 * connection, pages still refresh on their polling interval.
 */
import { useSyncExternalStore } from 'react';

let connected = false;
const listeners = new Set<() => void>();

export function setLiveConnected(value: boolean): void {
  if (connected === value) return;
  connected = value;
  for (const listener of listeners) listener();
}

export function isLiveConnected(): boolean {
  return connected;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while the live-update connection is open; false on the server and before it opens. */
export function useLiveConnection(): boolean {
  return useSyncExternalStore(subscribe, isLiveConnected, () => false);
}
