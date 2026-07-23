// Extração de áudio de vídeos que exigem navegador real (Instagram Reels).
// O Instagram serve o vídeo via DASH por trás de um login wall: a página não
// expõe a URL do vídeo, mas um Chromium de verdade carrega o stream e nós
// interceptamos as faixas de mídia do CDN. Só o ÁUDIO importa (o objetivo é
// transcrever a fala), então baixamos a faixa de áudio e mandamos ao Gemini.

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// URLs que precisam de navegador (a raspagem simples só pega a legenda).
export function isReelUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^(www|m)\./, "");
    if (h === "instagram.com") return /^\/(reel|reels|p|tv)\//.test(u.pathname);
    return false;
  } catch {
    return false;
  }
}

// O Instagram rotula TODAS as faixas como `video/mp4` (áudio e vídeo). Para
// achar a faixa de áudio, lemos o box `hdlr` do MP4: handler_type `soun` = som,
// `vide` = imagem. Basta um trecho inicial (o moov fica no começo).
export function isAudioTrack(head: Buffer): boolean {
  let from = 0;
  for (;;) {
    const h = head.indexOf("hdlr", from);
    if (h < 0) return false;
    const win = head.subarray(h, h + 24).toString("latin1");
    if (win.includes("soun")) return true;
    from = h + 4;
  }
}

export type ReelMedia = { audio: Buffer; mediaType: string; caption: string | null };

// Remove os parâmetros de faixa de bytes, mantendo o token de auth (efg/…).
function stripByteRange(url: string): string {
  return url.replace(/[?&](bytestart|byteend)=[^&]*/g, (m) => (m[0] === "?" ? "?" : ""));
}

export async function extractReelAudio(
  url: string,
  opts: { timeoutMs?: number; maxProbe?: number } = {},
): Promise<ReelMedia> {
  const { timeoutMs = 30000, maxProbe = 16 } = opts;
  // Import dinâmico: o playwright/Chromium só é carregado quando um reel aparece.
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const ctx = await browser.newContext({ userAgent: DESKTOP_UA, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();

    // A página /reels/<id> é um FEED: o reel-alvo é o primeiro (índice 0) e há
    // vizinhos pré-carregados. Como o autoplay é MUDO, qual faixa de áudio baixa
    // é arbitrário. Então forçamos SÓ o vídeo 0 a tocar com som e neutralizamos
    // os vizinhos — assim a faixa de áudio do alvo é a que baixa por inteiro.
    const bases = new Map<string, { url: string; bytes: number }>();
    page.on("response", (res) => {
      const ct = res.headers()["content-type"] || "";
      const u = res.url();
      if (/\.mp4/.test(u) && ct.startsWith("video/")) {
        const base = u.split("?")[0];
        const bytes = parseInt(res.headers()["content-length"] || "0", 10) || 0;
        const cur = bases.get(base);
        if (cur) cur.bytes += bytes;
        else bases.set(base, { url: u, bytes });
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(2500);
    await page
      .evaluate(() => {
        const vids = Array.from(document.querySelectorAll("video"));
        vids.forEach((v, i) => {
          if (i === 0) {
            v.muted = false;
            v.volume = 1;
            void v.play?.().catch(() => {});
          } else {
            try { v.pause(); v.removeAttribute("src"); v.load?.(); } catch { /* ignore */ }
          }
        });
      })
      .catch(() => {});
    // deixa o reel-alvo tocar e puxar a faixa de áudio inteira
    await page.waitForTimeout(8000);

    const caption = (await page
      .evaluate(() => {
        const g = (p: string) =>
          document.querySelector(`meta[property="${p}"]`)?.getAttribute("content") || null;
        return g("og:title") || g("og:description");
      })
      .catch(() => null)) as string | null;

    // Entre as faixas de áudio, a do alvo é a que mais baixou bytes (tocou por
    // inteiro). Percorre da maior pra menor, sonda o box hdlr e baixa a 1ª áudio.
    const ranked = Array.from(bases.values()).sort((a, b) => b.bytes - a.bytes).slice(0, maxProbe);
    for (const { url: full } of ranked) {
      const clean = stripByteRange(full);
      try {
        const probe = await page.request.get(clean, { headers: { range: "bytes=0-131071", accept: "*/*" } });
        if (!probe.ok() && probe.status() !== 206) continue;
        if (!isAudioTrack(Buffer.from(await probe.body()))) continue;
        const res = await page.request.get(clean, { headers: { accept: "*/*" } });
        if (!res.ok()) continue;
        const audio = Buffer.from(await res.body());
        if (audio.length > 20_000) return { audio, mediaType: "audio/mp4", caption };
      } catch {
        // tenta a próxima faixa
      }
    }
    throw new Error("reel: faixa de áudio não encontrada");
  } finally {
    await browser.close();
  }
}
