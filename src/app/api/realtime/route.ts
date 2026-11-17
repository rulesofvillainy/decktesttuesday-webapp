import { NextRequest } from 'next/server';
import { registerSSEClient, unregisterSSEClient } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = crypto.randomUUID();
  let keepAliveTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      registerSSEClient(id, controller);

      // Send initial connect payload
      const initialPayload = JSON.stringify({ type: 'connected', id, timestamp: Date.now() });
      controller.enqueue(new TextEncoder().encode(`data: ${initialPayload}\n\n`));

      // 25s keepalive ping
      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
        } catch {
          if (keepAliveTimer) clearInterval(keepAliveTimer);
          unregisterSSEClient(id);
        }
      }, 25000);
    },
    cancel() {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      unregisterSSEClient(id);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

