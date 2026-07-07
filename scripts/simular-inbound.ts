import "dotenv/config";
import { db } from "../src/db";
import { ingestInput } from "../src/lib/ingest";
import { classifyInput } from "../src/lib/classify";
import { R2Store } from "../src/lib/r2";
import { readFileSync } from "node:fs";

// Usage:
//   npm run simular-inbound -- "Texto do input"
//   npm run simular-inbound -- --image caminho/para/imagem.png "legenda opcional"
async function main() {
  const args = process.argv.slice(2);
  let imagePath: string | null = null;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--image") { imagePath = args[++i]; } else rest.push(args[i]);
  }
  const text = rest.join(" ") || "";
  const images = imagePath
    ? [{ buffer: readFileSync(imagePath), contentType: "image/png", filename: imagePath.split("/").pop() ?? "img.png" }]
    : [];

  const id = await ingestInput(
    { db, store: new R2Store(), classifier: (p, c) => classifyInput(p, c) },
    { source: "email", sender: "teste@exemplo.com", subject: text.slice(0, 40) || "Screenshot",
      text, html: null, messageId: `<sim-${Date.now()}@local>`, images },
  );
  console.log("ingested:", id);
  process.exit(0);
}
main();
