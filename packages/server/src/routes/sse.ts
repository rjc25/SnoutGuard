/**
 * Server-Sent Events endpoint for live dashboard updates.
 * Provides real-time notifications for review completions,
 * analysis results, velocity changes, drift alerts, and more.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AuthUser } from '../auth/rbac.js';

// ─── Types ────────────────────────────────────────────────────────

/** SSE event types broadcast to connected clients */
export type SSEEventType =
  | 'review:completed'
  | 'analysis:completed'
  | 'analysis:progress'
  | 'velocity:updated'
  | 'drift:alert'
  | 'summary:generated'
  | 'decision:changed'
  | 'sync:completed'
  | 'connected'
  | 'heartbeat';

/** SSE event payload */
export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: string;
  orgId?: string;
}

// ─── Client Management ────────────────────────────────────────────

/** A connected SSE client */
interface SSEClient {
  id: string;
  orgId: string;
  userId: string;
  write: (event: SSEEvent) => Promise<void>;
  close: () => void;
}

/** Registry of connected SSE clients */
const clients = new Map<string, SSEClient>();

let clientIdCounter = 0;

/**
 * Broadcast an event to all connected SSE clients in a specific organization.
 * If no orgId is provided, broadcasts to all clients.
 */
export function broadcastEvent(type: SSEEventType, data: unknown, orgId?: string): void {
  const event: SSEEvent = {
    type,
    data,
    timestamp: new Date().toISOString(),
    orgId,
  };

  for (const [id, client] of clients) {
    // Filter by org if specified
    if (orgId && client.orgId !== orgId) continue;

    client.write(event).catch(() => {
      // Client disconnected, remove from registry
      clients.delete(id);
    });
  }
}

/**
 * Get the number of connected SSE clients.
 */
export function getConnectedClientCount(orgId?: string): number {
  if (!orgId) return clients.size;
  let count = 0;
  for (const client of clients.values()) {
    if (client.orgId === orgId) count++;
  }
  return count;
}

// ─── Router ───────────────────────────────────────────────────────

/**
 * Create the SSE router.
 * The /api/events endpoint provides a real-time event stream.
 */
export function createSSERouter(): Hono {
  const router = new Hono();

  // ─── GET /api/events - SSE stream ─────────────────────────────
  router.get('/', async (c) => {
    const user = c.get('user') as AuthUser | undefined;
    const orgId = (c.get('orgId') as string) ?? 'anonymous';
    const userId = user?.id ?? 'anonymous';

    return streamSSE(c, async (stream) => {
      const clientId = `sse-${++clientIdCounter}-${Date.now()}`;

      // Register this client
      const client: SSEClient = {
        id: clientId,
        orgId,
        userId,
        write: async (event: SSEEvent) => {
          await stream.writeSSE({
            data: JSON.stringify(event),
            event: event.type,
            id: `${clientId}-${Date.now()}`,
          });
        },
        close: () => {
          clients.delete(clientId);
        },
      };

      clients.set(clientId, client);

      // Send initial connection event
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'connected',
          clientId,
          connectedClients: getConnectedClientCount(orgId),
          timestamp: new Date().toISOString(),
        }),
        event: 'connected',
        id: `${clientId}-connected`,
      });

      // Heartbeat to keep connection alive (every 30 seconds)
      const heartbeatInterval = setInterval(async () => {
        try {
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'heartbeat',
              timestamp: new Date().toISOString(),
            }),
            event: 'heartbeat',
          });
        } catch {
          clearInterval(heartbeatInterval);
          clients.delete(clientId);
        }
      }, 30_000);

      // Clean up on disconnect
      stream.onAbort(() => {
        clearInterval(heartbeatInterval);
        clients.delete(clientId);
      });

      // Keep the stream open indefinitely
      await new Promise<void>(() => {
        // Stream stays open until client disconnects
      });
    });
  });

  return router;
}
