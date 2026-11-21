/** Server-Sent Events stream for one month: sends `make()` now and again after every change. */
import { subscribe } from "./events";

export function sseStream(req: Request, monthId: string, make: () => Promise<unknown>, event = "snapshot") {
  const enc = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let timer: NodeJS.Timeout | undefined;
      const send = (s: string) => {
        if (!closed) controller.enqueue(enc.encode(s));
      };
      const push = async () => {
        try {
          send(`event: ${event}\ndata: ${JSON.stringify(await make())}\n\n`);
        } catch {
          send(`event: gone\ndata: {}\n\n`);
        }
      };
      // coalesce bursts (20 bids in a second → a few snapshots, not 20)
      const schedule = () => {
        if (timer) return;
        timer = setTimeout(() => {
          timer = undefined;
          void push();
        }, 80);
      };
      const unsub = subscribe(monthId, schedule);
      const beat = setInterval(() => send(`: ping\n\n`), 15_000);
      stop = () => {
        if (closed) return;
        closed = true;
        unsub();
        clearInterval(beat);
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", stop);
      send(`retry: 2000\n\n`);
      await push();
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
