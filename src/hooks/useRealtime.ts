'use client';

import { useEffect, useRef } from 'react';

type RealtimeCallback = (data: { type: string; [key: string]: unknown }) => void;

export function useRealtime(callback?: RealtimeCallback, fallbackIntervalMs = 0) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let fallbackInterval: NodeJS.Timeout | null = null;
    let isDisposed = false;

    function connect() {
      if (isDisposed) return;
      try {
        es = new EventSource('/api/realtime');

        es.onmessage = (event) => {
          if (!event.data) return;
          try {
            const parsed = JSON.parse(event.data);
            cbRef.current?.(parsed);
          } catch {
            // Ignore parse errors (e.g. keepalive comments)
          }
        };

        es.onerror = () => {
          es?.close();
          if (!isDisposed) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
      } catch (err) {
        if (!isDisposed) {
          reconnectTimeout = setTimeout(connect, 4000);
        }
      }
    }

    connect();

    // Fallback polling tick to ensure UI never goes stale
    if (fallbackIntervalMs > 0) {
      fallbackInterval = setInterval(() => {
        cbRef.current?.({ type: 'poll_tick', timestamp: Date.now() });
      }, fallbackIntervalMs);
    }

    return () => {
      isDisposed = true;
      es?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, [fallbackIntervalMs]);
}

