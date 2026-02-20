'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createSSEConnection } from '@/lib/api';

export interface SSEOptions {
  /** The API path to connect to */
  path: string;
  /** Whether to automatically connect on mount */
  autoConnect?: boolean;
  /** Event types to listen for (defaults to 'message') */
  eventTypes?: string[];
  /** Reconnect delay in ms (defaults to 3000) */
  reconnectDelay?: number;
  /** Max reconnect attempts (defaults to 5) */
  maxReconnectAttempts?: number;
}

export interface SSEMessage<T = unknown> {
  type: string;
  data: T;
  timestamp: number;
}

export type SSEStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export function useSSE<T = unknown>(options: SSEOptions) {
  const {
    path,
    autoConnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5,
  } = options;

  const [status, setStatus] = useState<SSEStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<SSEMessage<T> | null>(null);
  const [messages, setMessages] = useState<SSEMessage<T>[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  const connect = useCallback(() => {
    disconnect();
    setStatus('connecting');
    setError(null);

    const source = createSSEConnection(
      path,
      (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data) as T;
          const message: SSEMessage<T> = {
            type: event.type || 'message',
            data: parsed,
            timestamp: Date.now(),
          };
          setLastMessage(message);
          setMessages((prev) => [...prev.slice(-99), message]);
          setStatus('connected');
          reconnectAttemptsRef.current = 0;
        } catch {
          // Handle non-JSON messages
          const message: SSEMessage<T> = {
            type: event.type || 'message',
            data: event.data as T,
            timestamp: Date.now(),
          };
          setLastMessage(message);
          setMessages((prev) => [...prev.slice(-99), message]);
        }
      },
      () => {
        setStatus('error');
        setError('SSE connection lost');

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1);
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setError(`Failed to reconnect after ${maxReconnectAttempts} attempts`);
        }
      },
    );

    sourceRef.current = source;
  }, [path, disconnect, reconnectDelay, maxReconnectAttempts]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setLastMessage(null);
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    status,
    lastMessage,
    messages,
    error,
    connect,
    disconnect,
    clearMessages,
  };
}
