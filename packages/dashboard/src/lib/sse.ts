'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from './auth';

export type SSEStatus = 'connecting' | 'open' | 'closed' | 'error';

export interface SSEEvent {
  type: string;
  data: unknown;
  id?: string;
  retry?: number;
}

interface UseEventSourceOptions {
  /** URL path for the SSE endpoint (relative to API base). Defaults to '/events'. */
  path?: string;
  /** Event types to listen for. If empty, listens for all message events. */
  eventTypes?: string[];
  /** Whether to automatically reconnect on error. Defaults to true. */
  autoReconnect?: boolean;
  /** Maximum number of reconnect attempts. Defaults to 5. */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Defaults to 1000. */
  retryDelay?: number;
  /** Callback when an event is received. */
  onEvent?: (event: SSEEvent) => void;
  /** Callback when connection status changes. */
  onStatusChange?: (status: SSEStatus) => void;
}

/**
 * React hook for connecting to an SSE (Server-Sent Events) endpoint.
 * Automatically manages connection lifecycle, reconnection with exponential backoff,
 * and dispatches events to subscribers.
 */
export function useEventSource(options: UseEventSourceOptions = {}) {
  const {
    path = '/events',
    eventTypes = [],
    autoReconnect = true,
    maxRetries = 5,
    retryDelay = 1000,
    onEvent,
    onStatusChange,
  } = options;

  const [status, setStatus] = useState<SSEStatus>('closed');
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [events, setEvents] = useState<SSEEvent[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateStatus = useCallback(
    (newStatus: SSEStatus) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    },
    [onStatusChange],
  );

  const handleEvent = useCallback(
    (event: SSEEvent) => {
      setLastEvent(event);
      setEvents((prev) => [...prev.slice(-99), event]); // Keep last 100 events
      onEvent?.(event);
    },
    [onEvent],
  );

  const disconnect = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    updateStatus('closed');
  }, [updateStatus]);

  const connect = useCallback(() => {
    disconnect();

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
    const token = getAccessToken();
    const url = new URL(`${baseUrl}${path}`, window.location.origin);
    if (token) {
      url.searchParams.set('token', token);
    }

    updateStatus('connecting');

    const source = new EventSource(url.toString());
    eventSourceRef.current = source;

    source.onopen = () => {
      retryCountRef.current = 0;
      updateStatus('open');
    };

    source.onerror = () => {
      source.close();
      eventSourceRef.current = null;
      updateStatus('error');

      if (autoReconnect && retryCountRef.current < maxRetries) {
        const delay = retryDelay * Math.pow(2, retryCountRef.current);
        retryCountRef.current += 1;
        retryTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        updateStatus('closed');
      }
    };

    // Default message handler
    source.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        handleEvent({
          type: 'message',
          data,
          id: event.lastEventId || undefined,
        });
      } catch {
        handleEvent({
          type: 'message',
          data: event.data,
          id: event.lastEventId || undefined,
        });
      }
    };

    // Named event handlers
    for (const eventType of eventTypes) {
      source.addEventListener(eventType, (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          handleEvent({
            type: eventType,
            data,
            id: event.lastEventId || undefined,
          });
        } catch {
          handleEvent({
            type: eventType,
            data: event.data,
            id: event.lastEventId || undefined,
          });
        }
      });
    }
  }, [path, eventTypes, autoReconnect, maxRetries, retryDelay, disconnect, updateStatus, handleEvent]);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLastEvent(null);
  }, []);

  return {
    status,
    lastEvent,
    events,
    connect,
    disconnect,
    clearEvents,
  };
}
