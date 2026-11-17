// Server-Sent Events (SSE) Real-Time Event Hub for Deck Test Tuesday

type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

declare global {
  var __dttSSEClients: Map<string, ReadableStreamDefaultController<Uint8Array>> | undefined;
}

const clients = globalThis.__dttSSEClients || new Map<string, ReadableStreamDefaultController<Uint8Array>>();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__dttSSEClients = clients;
}

export function registerSSEClient(id: string, controller: ReadableStreamDefaultController<Uint8Array>) {
  clients.set(id, controller);
}

export function unregisterSSEClient(id: string) {
  clients.delete(id);
}

export function getConnectedClientCount(): number {
  return clients.size;
}

export function broadcastRealtimeEvent(type: string, payload: Record<string, unknown> = {}) {
  const message = JSON.stringify({ type, timestamp: Date.now(), ...payload });
  const data = `data: ${message}\n\n`;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);

  for (const [id, controller] of clients.entries()) {
    try {
      controller.enqueue(bytes);
    } catch {
      clients.delete(id);
    }
  }
}

