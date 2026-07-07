// Runs once when the Node server boots (Next.js instrumentation hook).
// Starts an in-process loop that pings /api/poll every minute so forwarded
// emails are ingested automatically — no external cron needed. Safe for a
// single always-on Railway instance; the poller has its own in-process lock.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const secret = process.env.INBOUND_SECRET;
  if (!secret) {
    console.warn("instrumentation: INBOUND_SECRET not set — poll loop disabled");
    return;
  }

  const port = process.env.PORT || "3000";
  const url = `http://127.0.0.1:${port}/api/poll`;
  const intervalMs = Number(process.env.POLL_INTERVAL_MS) || 60_000;

  const tick = async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "x-inbound-secret": secret },
      });
      if (!res.ok) console.warn(`poll loop: http ${res.status}`);
    } catch (err) {
      console.warn("poll loop: fetch failed", err);
    }
  };

  // First tick after one interval (server is listening by then), then repeat.
  setInterval(tick, intervalMs);
  console.log(`instrumentation: poll loop armed every ${intervalMs}ms`);
}
