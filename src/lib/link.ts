import type { NormalizedInput } from "./email";

// Normaliza uma URL colada (aceita sem esquema).
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]?.trim()) return decodeEntities(m[1].trim());
  }
  return null;
}

function extractTitle(html: string): string | null {
  return (
    metaContent(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
    ]) ||
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ? decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1].trim())
      : null)
  );
}

// Extrai texto legível: remove script/style/nav/etc, tira tags, colapsa espaços.
function htmlToText(html: string): string {
  const body = html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html;
  return decodeEntities(
    body
      .replace(/<(script|style|noscript|template|svg|head|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export async function fetchLink(url: string): Promise<NormalizedInput> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; InputsBot/1.0; +https://latenewsfeed-production.up.railway.app)",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  const ct = res.headers.get("content-type") ?? "";
  if (!res.ok) throw new Error(`link http ${res.status}`);
  if (!ct.includes("html") && !ct.includes("text")) throw new Error(`link content-type ${ct}`);

  const html = (await res.text()).slice(0, 800_000);
  const title = extractTitle(html) || new URL(url).hostname;
  const desc = metaContent(html, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ]);
  const body = htmlToText(html).slice(0, 14_000);
  const text = [desc ? `Descrição: ${desc}` : "", body].filter(Boolean).join("\n\n").trim();
  if (!text) throw new Error("link: sem texto extraível");

  return {
    source: "link",
    sender: null,
    subject: title.slice(0, 300),
    text,
    html: null,
    messageId: null,
    url,
    images: [],
  };
}
