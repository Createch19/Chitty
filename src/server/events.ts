/**
 * Live room events. Any change to a month (open, join, bid, close, lottery, date) calls publish(monthId);
 * every open SSE stream for that month re-sends a fresh snapshot. Snapshots (not diffs) make reconnects
 * trivially correct: a reconnecting phone just gets the current state.
 *
 * In-process: Chitty runs as one container. If it ever runs as several, swap this for PostgreSQL LISTEN/NOTIFY.
 */
import { EventEmitter } from "node:events";

const g = globalThis as unknown as { __chittyBus?: EventEmitter };
const bus = (g.__chittyBus ??= new EventEmitter().setMaxListeners(0));

export function publish(monthId: string) {
  bus.emit(`month:${monthId}`);
}

export function subscribe(monthId: string, fn: () => void) {
  bus.on(`month:${monthId}`, fn);
  return () => {
    bus.off(`month:${monthId}`, fn);
  };
}

export const listeners = (monthId: string) => bus.listenerCount(`month:${monthId}`);
