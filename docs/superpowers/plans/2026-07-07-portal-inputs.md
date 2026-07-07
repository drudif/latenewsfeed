# Portal de Inputs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user personal inbox-zero feed: inputs arrive by forwarded email (read from Gmail via IMAP) or by pasting text/screenshots directly, get auto-classified by Claude into fixed categories, appear in an infinite-scroll feed, and move to a searchable archive when marked read.

**Architecture:** One Next.js 15 (App Router, TypeScript) app on Railway. Postgres (via Drizzle) stores inputs/attachments/categories. Cloudflare R2 (S3-compatible) stores images. A cron hits `/api/poll` every ~1 min; the poller reads Gmail over IMAP (`imapflow`), parses messages (`mailparser`), and runs the same ingestion pipeline used by pasted inputs. Claude (Haiku 4.5, multimodal) classifies each input. A URL-secret cookie gate protects the UI; `/api/poll` uses its own shared-secret header.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS v4, Drizzle ORM + Postgres (postgres.js), `@electric-sql/pglite` for tests, `@aws-sdk/client-s3` (R2), `@anthropic-ai/sdk`, `imapflow`, `mailparser`, `zod`, Vitest, `tsx`.

**Key design decisions locked here (refine spec if they surprise you):**
- Paste posts image bytes directly to `/api/paste` (multipart). The server uploads to R2 and reuses the bytes for vision classification. No separate `/api/upload`.
- Full-text search is query-time (`to_tsvector('portuguese', …) @@ plainto_tsquery`). No generated column, no GIN index in v1 (personal scale). Revisit if the archive gets large.
- Ingestion is one shared function (`ingestInput`) used by the poller, `/api/paste`, and the `simular-inbound` script.

---

## File Structure

```
portal-inputs/
  package.json, tsconfig.json, next.config.ts, vitest.config.ts
  drizzle.config.ts
  .env.example
  postcss.config.mjs                     # from create-next-app (Tailwind v4)
  drizzle/                               # generated SQL migrations
  scripts/
    seed.ts                              # seed categories (+ sample inputs)
    simular-inbound.ts                   # inject a fake email into ingestInput
  src/
    db/
      schema.ts                          # inputs, attachments, categories, poll_state
      index.ts                           # prod postgres.js client
    lib/
      categories.ts                      # DEFAULT_CATEGORIES, OUTROS_SLUG, slugify
      cursor.ts                          # encode/decode feed/archive cursor
      r2.ts                              # R2 client + uploadImage
      classify.ts                        # buildClassifyRequest, parseClassification, fallbackClassification, classifyInput
      email.ts                           # parseEmail(raw) -> NormalizedInput
      imap.ts                            # MailReader interface, GmailImapReader, FakeMailReader
      ingest.ts                          # ingestInput(deps, normalized)
      auth.ts                            # AUTH_COOKIE, isAuthed
    middleware.ts                        # URL-secret gate (excludes /api/poll)
    app/
      layout.tsx, globals.css
      page.tsx                           # feed
      arquivo/page.tsx                   # archive
      ajustes/page.tsx                   # categories settings
      api/
        poll/route.ts                    # POST: read Gmail, ingest
        paste/route.ts                   # POST multipart: text + images
        feed/route.ts                    # GET: unread, cursor
        archive/route.ts                 # GET: read, cursor, FTS
        inputs/[id]/read/route.ts        # PATCH: set read_at
        categories/route.ts              # GET/POST/PATCH/DELETE
    components/
      Feed.tsx, InputCard.tsx, Composer.tsx, CategoryChips.tsx, ArchiveView.tsx, CategoryManager.tsx
  test/
    helpers/db.ts                        # pglite test db + applyMigrations + seed
    fixtures/                            # sample .eml files
    *.test.ts
```

---

## Task 1: Scaffold the Next.js app and dependencies

**Files:**
- Create: whole project via `create-next-app`
- Modify: `package.json`

- [ ] **Step 1: Scaffold Next.js into the existing project dir**

The project dir already exists (with `docs/` and a git repo). Scaffold into it:

```bash
cd /Users/fernando.drudi/Desktop/VIBECODING/portal-inputs
npx create-next-app@latest . --ts --tailwind --app --src-dir --import-alias "@/*" --eslint --no-turbopack
```

When prompted that the directory is not empty, choose to continue (it only contains `docs/` and `.git`). This creates `src/app`, `postcss.config.mjs`, `next.config.ts`, `tsconfig.json`.

- [ ] **Step 2: Install runtime and dev dependencies**

```bash
npm install drizzle-orm postgres @aws-sdk/client-s3 @anthropic-ai/sdk imapflow mailparser zod
npm install -D drizzle-kit @electric-sql/pglite vitest tsx @types/mailparser dotenv
```

- [ ] **Step 3: Add scripts to package.json**

In `package.json`, set the `"scripts"` block to:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:push": "drizzle-kit push",
  "seed": "tsx scripts/seed.ts",
  "simular-inbound": "tsx scripts/simular-inbound.ts"
}
```

- [ ] **Step 4: Create vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

- [ ] **Step 5: Create `.env.example`**

Create `.env.example`:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/portal_inputs
PORTAL_SECRET=troque-por-uma-string-longa-aleatoria
INBOUND_SECRET=outra-string-longa-aleatoria
GMAIL_USER=latenewsfeed@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
GMAIL_TARGET_ADDRESS=latenewsfeed+f.drudi@gmail.com
ANTHROPIC_API_KEY=sk-ant-...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=portal-inputs
R2_PUBLIC_URL=https://pub-xxxx.r2.dev
```

- [ ] **Step 6: Verify the app builds and commit**

```bash
npm run build
git add -A
git commit -m "chore: scaffold Next.js app + deps + tooling"
```
Expected: build succeeds.

---

## Task 2: Database schema

**Files:**
- Create: `src/db/schema.ts`, `drizzle.config.ts`, `src/db/index.ts`

- [ ] **Step 1: Write the schema**

Create `src/db/schema.ts`:

```ts
import {
  pgTable, uuid, text, integer, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const inputs = pgTable(
  "inputs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(), // 'email' | 'paste'
    categorySlug: text("category_slug").notNull().references(() => categories.slug),
    title: text("title").notNull(),
    bodyText: text("body_text").notNull().default(""),
    html: text("html"),
    sender: text("sender"),
    subject: text("subject"),
    summary: text("summary"),
    messageId: text("message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => ({
    // Postgres unique index allows multiple NULLs -> dedupe only real message-ids.
    messageIdUnique: uniqueIndex("inputs_message_id_unique").on(t.messageId),
    feedIdx: index("inputs_feed_idx").on(t.readAt, t.createdAt),
  }),
);

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  inputId: uuid("input_id").notNull().references(() => inputs.id, { onDelete: "cascade" }),
  r2Key: text("r2_key").notNull(),
  contentType: text("content_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  filename: text("filename"),
  status: text("status").notNull().default("ok"), // 'ok' | 'failed'
});

// Single-row table (id always 1) tracking the last processed Gmail UID.
export const pollState = pgTable("poll_state", {
  id: integer("id").primaryKey(),
  lastUid: integer("last_uid").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Write drizzle config**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 3: Write the prod db client**

Create `src/db/index.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle(client, { schema });
export type Db = typeof db;
```

- [ ] **Step 4: Generate the migration**

```bash
npm run db:generate
```
Expected: a `drizzle/0000_*.sql` file is created containing all four tables.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: database schema + drizzle config"
```

---

## Task 3: Test database helper (pglite)

**Files:**
- Create: `test/helpers/db.ts`

This lets every DB test run in-memory with no Postgres server.

- [ ] **Step 1: Write the helper**

Create `test/helpers/db.ts`:

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as schema from "@/db/schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export async function makeTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  const dir = path.resolve(__dirname, "../../drizzle");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = readFileSync(path.join(dir, f), "utf8");
    // drizzle migrations use `--> statement-breakpoint` between statements
    for (const stmt of sql.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim();
      if (trimmed) await pg.exec(trimmed);
    }
  }
  return db;
}

export async function seedCategories(db: TestDb) {
  const { DEFAULT_CATEGORIES } = await import("@/lib/categories");
  await db.insert(schema.categories).values(DEFAULT_CATEGORIES).onConflictDoNothing();
}
```

- [ ] **Step 2: Smoke test the helper**

Create `test/db-helper.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeTestDb } from "./helpers/db";
import { categories } from "@/db/schema";

describe("test db", () => {
  it("applies migrations and can query", async () => {
    const db = await makeTestDb();
    const rows = await db.select().from(categories);
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it**

Run: `npm test -- test/db-helper.test.ts`
Expected: PASS (this also proves Task 2's migration is valid SQL). Note: `@/lib/categories` does not exist yet, but `seedCategories` is not called here, so the dynamic import never runs.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: in-memory pglite test database helper"
```

---

## Task 4: Categories module (constants + slugify)

**Files:**
- Create: `src/lib/categories.ts`, `test/categories.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/categories.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slugify, DEFAULT_CATEGORIES, OUTROS_SLUG } from "@/lib/categories";

describe("slugify", () => {
  it("lowercases, strips accents, hyphenates", () => {
    expect(slugify("Inspiração / Referência")).toBe("inspiracao-referencia");
    expect(slugify("Ler / Ver depois")).toBe("ler-ver-depois");
    expect(slugify("  Pessoal!!  ")).toBe("pessoal");
  });
});

describe("default categories", () => {
  it("includes the outros fallback", () => {
    expect(DEFAULT_CATEGORIES.some((c) => c.slug === OUTROS_SLUG)).toBe(true);
  });
  it("has unique slugs", () => {
    const slugs = DEFAULT_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/categories.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/categories.ts`:

```ts
export const OUTROS_SLUG = "outros";

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const DEFAULT_CATEGORIES = [
  { slug: "ler-depois", name: "Ler / Ver depois", sortOrder: 0 },
  { slug: "inspiracao", name: "Inspiração / Referência", sortOrder: 1 },
  { slug: "pessoal", name: "Pessoal / Vida", sortOrder: 2 },
  { slug: OUTROS_SLUG, name: "Outros", sortOrder: 3 },
];
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- test/categories.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: categories constants + slugify"
```

---

## Task 5: Cursor encode/decode

**Files:**
- Create: `src/lib/cursor.ts`, `test/cursor.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/cursor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "@/lib/cursor";

describe("cursor", () => {
  it("round-trips", () => {
    const c = { createdAt: "2026-07-07T12:00:00.000Z", id: "abc-123" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });
  it("returns null on garbage", () => {
    expect(decodeCursor("not-base64-!!")).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/cursor.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/cursor.ts`:

```ts
export type Cursor = { createdAt: string; id: string };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.createdAt}|${c.id}`).toString("base64url");
}

export function decodeCursor(raw: string): Cursor | null {
  if (!raw) return null;
  try {
    const [createdAt, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
    if (!createdAt || !id) return null;
    if (Number.isNaN(Date.parse(createdAt))) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- test/cursor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: feed cursor encode/decode"
```

---

## Task 6: Claude classification (parsing + fallback, then the call)

**Files:**
- Create: `src/lib/classify.ts`, `test/classify.test.ts`

The network call is isolated so parsing/fallback are pure and tested; `classifyInput` catches all errors and returns the fallback.

- [ ] **Step 1: Write failing tests**

Create `test/classify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseClassification, fallbackClassification, classifyInput,
} from "@/lib/classify";

const CATS = [
  { slug: "ler-depois", name: "Ler / Ver depois" },
  { slug: "inspiracao", name: "Inspiração / Referência" },
  { slug: "outros", name: "Outros" },
];

describe("parseClassification", () => {
  it("accepts a valid tool result", () => {
    const out = parseClassification(
      { category_slug: "inspiracao", title: "Um site legal", summary: "Ref de UI." },
      CATS.map((c) => c.slug),
    );
    expect(out).toEqual({ categorySlug: "inspiracao", title: "Um site legal", summary: "Ref de UI." });
  });
  it("throws on an unknown category", () => {
    expect(() =>
      parseClassification({ category_slug: "xpto", title: "t", summary: "s" }, ["outros"]),
    ).toThrow();
  });
  it("throws on a missing title", () => {
    expect(() =>
      parseClassification({ category_slug: "outros", summary: "s" }, ["outros"]),
    ).toThrow();
  });
});

describe("fallbackClassification", () => {
  it("uses subject as title when present", () => {
    const out = fallbackClassification({ subject: "Assunto X", text: "corpo" });
    expect(out).toEqual({ categorySlug: "outros", title: "Assunto X", summary: null });
  });
  it("falls back to first line of text", () => {
    const out = fallbackClassification({ text: "primeira linha\nsegunda" });
    expect(out.title).toBe("primeira linha");
  });
  it("uses a generic title when nothing usable", () => {
    const out = fallbackClassification({});
    expect(out.title.length).toBeGreaterThan(0);
  });
});

describe("classifyInput", () => {
  it("returns parsed result when the client succeeds", async () => {
    const fakeClient = {
      messages: {
        create: async () => ({
          content: [{ type: "tool_use", name: "classificar",
            input: { category_slug: "ler-depois", title: "Artigo", summary: "resumo" } }],
        }),
      },
    };
    const out = await classifyInput(
      { subject: "s", text: "t" }, CATS, fakeClient as never,
    );
    expect(out.categorySlug).toBe("ler-depois");
  });
  it("falls back when the client throws", async () => {
    const fakeClient = { messages: { create: async () => { throw new Error("boom"); } } };
    const out = await classifyInput(
      { subject: "Assunto Y", text: "t" }, CATS, fakeClient as never,
    );
    expect(out).toEqual({ categorySlug: "outros", title: "Assunto Y", summary: null });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/classify.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/classify.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { OUTROS_SLUG } from "./categories";

export const MODEL = "claude-haiku-4-5-20251001";

export type ClassifyPayload = {
  subject?: string | null;
  text?: string | null;
  sender?: string | null;
  image?: { base64: string; mediaType: string } | null;
};

export type Classification = {
  categorySlug: string;
  title: string;
  summary: string | null;
};

export type CategoryLite = { slug: string; name: string };

const resultSchema = z.object({
  category_slug: z.string().min(1),
  title: z.string().min(1).max(200),
  summary: z.string().max(500).optional().nullable(),
});

export function parseClassification(raw: unknown, validSlugs: string[]): Classification {
  const parsed = resultSchema.parse(raw);
  if (!validSlugs.includes(parsed.category_slug)) {
    throw new Error(`invalid category: ${parsed.category_slug}`);
  }
  return {
    categorySlug: parsed.category_slug,
    title: parsed.title,
    summary: parsed.summary ?? null,
  };
}

export function fallbackClassification(payload: ClassifyPayload): Classification {
  const fromSubject = payload.subject?.trim();
  const fromText = payload.text?.trim().split("\n")[0]?.trim();
  const title = fromSubject || fromText || "Screenshot / sem título";
  return { categorySlug: OUTROS_SLUG, title: title.slice(0, 200), summary: null };
}

export function buildClassifyRequest(payload: ClassifyPayload, categories: CategoryLite[]) {
  const slugs = categories.map((c) => c.slug);
  const list = categories.map((c) => `- ${c.slug}: ${c.name}`).join("\n");

  const content: Anthropic.ContentBlockParam[] = [];
  if (payload.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: payload.image.mediaType as never, data: payload.image.base64 },
    });
  }
  const textParts = [
    payload.sender ? `Remetente: ${payload.sender}` : "",
    payload.subject ? `Assunto: ${payload.subject}` : "",
    payload.text ? `Conteúdo:\n${payload.text}` : "",
  ].filter(Boolean).join("\n\n");
  content.push({
    type: "text",
    text:
      `Classifique este item numa das categorias abaixo e gere um título curto (máx ~8 palavras) ` +
      `e um resumo de uma frase, em português.\n\nCategorias:\n${list}\n\n${textParts || "(sem texto — use a imagem)"}`,
  });

  return {
    model: MODEL,
    max_tokens: 400,
    tools: [{
      name: "classificar",
      description: "Registra a classificação do item.",
      input_schema: {
        type: "object" as const,
        properties: {
          category_slug: { type: "string", enum: slugs },
          title: { type: "string" },
          summary: { type: "string" },
        },
        required: ["category_slug", "title", "summary"],
      },
    }],
    tool_choice: { type: "tool" as const, name: "classificar" },
    messages: [{ role: "user" as const, content }],
  };
}

type MessagesClient = { messages: { create: (args: unknown) => Promise<{ content: unknown[] }> } };

export async function classifyInput(
  payload: ClassifyPayload,
  categories: CategoryLite[],
  client?: MessagesClient,
): Promise<Classification> {
  const anthropic = client ?? (new Anthropic() as unknown as MessagesClient);
  try {
    const res = await anthropic.messages.create(buildClassifyRequest(payload, categories));
    const toolUse = (res.content as Array<{ type: string; name?: string; input?: unknown }>)
      .find((b) => b.type === "tool_use" && b.name === "classificar");
    if (!toolUse) throw new Error("no tool_use block");
    return parseClassification(toolUse.input, categories.map((c) => c.slug));
  } catch {
    return fallbackClassification(payload);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- test/classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Claude classification with structured output + fallback"
```

---

## Task 7: Email parsing

**Files:**
- Create: `src/lib/email.ts`, `test/email.test.ts`, `test/fixtures/plain.eml`, `test/fixtures/with-image.eml`

- [ ] **Step 1: Create fixtures**

Create `test/fixtures/plain.eml`:

```
From: Fulano <fulano@example.com>
To: latenewsfeed+f.drudi@gmail.com
Subject: Artigo interessante
Message-ID: <abc123@example.com>
Content-Type: text/plain; charset=utf-8

Dá uma olhada nesse texto sobre design.
Segunda linha.
```

Create `test/fixtures/with-image.eml` (a tiny 1x1 PNG, base64, as a MIME attachment):

```
From: Fulano <fulano@example.com>
To: latenewsfeed+f.drudi@gmail.com
Subject: Screenshot
Message-ID: <img456@example.com>
Content-Type: multipart/mixed; boundary="BOUND"

--BOUND
Content-Type: text/plain; charset=utf-8

veja isso
--BOUND
Content-Type: image/png; name="shot.png"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="shot.png"

iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==
--BOUND--
```

- [ ] **Step 2: Write failing tests**

Create `test/email.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEmail } from "@/lib/email";

const fx = (n: string) => readFileSync(path.resolve(__dirname, "fixtures", n));

describe("parseEmail", () => {
  it("parses a plain-text email", async () => {
    const n = await parseEmail(fx("plain.eml"));
    expect(n.subject).toBe("Artigo interessante");
    expect(n.sender).toContain("fulano@example.com");
    expect(n.messageId).toBe("<abc123@example.com>");
    expect(n.text).toContain("design");
    expect(n.images).toHaveLength(0);
  });
  it("extracts image attachments", async () => {
    const n = await parseEmail(fx("with-image.eml"));
    expect(n.images).toHaveLength(1);
    expect(n.images[0].contentType).toBe("image/png");
    expect(n.images[0].buffer.length).toBeGreaterThan(0);
    expect(n.images[0].filename).toBe("shot.png");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- test/email.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

Create `src/lib/email.ts`:

```ts
import { simpleParser } from "mailparser";

export type ImagePart = {
  buffer: Buffer;
  contentType: string;
  filename: string | null;
};

export type NormalizedInput = {
  source: "email" | "paste";
  sender: string | null;
  subject: string | null;
  text: string;
  html: string | null;
  messageId: string | null;
  images: ImagePart[];
};

export async function parseEmail(raw: Buffer): Promise<NormalizedInput> {
  const mail = await simpleParser(raw);
  const images: ImagePart[] = (mail.attachments ?? [])
    .filter((a) => (a.contentType ?? "").startsWith("image/"))
    .map((a) => ({
      buffer: a.content as Buffer,
      contentType: a.contentType,
      filename: a.filename ?? null,
    }));
  return {
    source: "email",
    sender: mail.from?.text ?? null,
    subject: mail.subject ?? null,
    text: (mail.text ?? "").trim(),
    html: typeof mail.html === "string" ? mail.html : null,
    messageId: mail.messageId ?? null,
    images,
  };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- test/email.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: email MIME parsing to normalized input"
```

---

## Task 8: R2 image upload

**Files:**
- Create: `src/lib/r2.ts`

R2 is only exercised against the real service; it is injected into `ingestInput` so tests use a fake. No unit test here (thin S3 wrapper).

- [ ] **Step 1: Implement**

Create `src/lib/r2.ts`:

```ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

export interface ImageStore {
  upload(buffer: Buffer, contentType: string): Promise<string>; // returns r2Key
  publicUrl(key: string): string;
}

const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
};

export class R2Store implements ImageStore {
  private client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  async upload(buffer: Buffer, contentType: string): Promise<string> {
    const key = `inputs/${randomUUID()}.${EXT[contentType] ?? "bin"}`;
    await this.client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    return key;
  }

  publicUrl(key: string): string {
    return `${process.env.R2_PUBLIC_URL}/${key}`;
  }
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
npx tsc --noEmit
git add -A
git commit -m "feat: R2 image store"
```
Expected: no type errors.

---

## Task 9: Ingestion pipeline

**Files:**
- Create: `src/lib/ingest.ts`, `test/ingest.test.ts`

This is the heart: one function used by poll, paste, and the simulate script.

- [ ] **Step 1: Write failing tests**

Create `test/ingest.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { makeTestDb, seedCategories } from "./helpers/db";
import { ingestInput } from "@/lib/ingest";
import { inputs, attachments } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { ImageStore } from "@/lib/r2";
import type { NormalizedInput } from "@/lib/email";

function fakeStore(): ImageStore {
  return { upload: vi.fn(async () => "inputs/fake.png"), publicUrl: (k) => `https://cdn/${k}` };
}
const okClassifier = async () => ({ categorySlug: "ler-depois", title: "T", summary: "S" });

function baseInput(over: Partial<NormalizedInput> = {}): NormalizedInput {
  return { source: "email", sender: null, subject: "s", text: "corpo", html: null,
    messageId: null, images: [], ...over };
}

describe("ingestInput", () => {
  it("inserts an input and returns its id", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const id = await ingestInput({ db, store: fakeStore(), classifier: okClassifier },
      baseInput());
    expect(id).toBeTruthy();
    const rows = await db.select().from(inputs).where(eq(inputs.id, id!));
    expect(rows[0].title).toBe("T");
    expect(rows[0].categorySlug).toBe("ler-depois");
  });

  it("dedupes by messageId", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const deps = { db, store: fakeStore(), classifier: okClassifier };
    const a = await ingestInput(deps, baseInput({ messageId: "<dup@x>" }));
    const b = await ingestInput(deps, baseInput({ messageId: "<dup@x>" }));
    expect(a).toBeTruthy();
    expect(b).toBeNull();
    expect((await db.select().from(inputs)).length).toBe(1);
  });

  it("uploads images and records attachments", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const store = fakeStore();
    const id = await ingestInput({ db, store, classifier: okClassifier },
      baseInput({ images: [{ buffer: Buffer.from("x"), contentType: "image/png", filename: "a.png" }] }));
    expect(store.upload).toHaveBeenCalledOnce();
    const att = await db.select().from(attachments).where(eq(attachments.inputId, id!));
    expect(att[0].status).toBe("ok");
    expect(att[0].r2Key).toBe("inputs/fake.png");
  });

  it("saves the input even when an upload fails, marking attachment failed", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const store: ImageStore = { upload: async () => { throw new Error("r2 down"); }, publicUrl: (k) => k };
    const id = await ingestInput({ db, store, classifier: okClassifier },
      baseInput({ images: [{ buffer: Buffer.from("x"), contentType: "image/png", filename: "a.png" }] }));
    expect(id).toBeTruthy();
    const att = await db.select().from(attachments).where(eq(attachments.inputId, id!));
    expect(att[0].status).toBe("failed");
  });

  it("rejects empty inputs (no text, no images)", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    await expect(ingestInput({ db, store: fakeStore(), classifier: okClassifier },
      baseInput({ text: "", images: [] }))).rejects.toThrow();
  });

  it("passes the first image to the classifier when text is thin", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const classifier = vi.fn(okClassifier);
    await ingestInput({ db, store: fakeStore(), classifier },
      baseInput({ text: "", images: [{ buffer: Buffer.from("x"), contentType: "image/png", filename: null }] }));
    const payload = classifier.mock.calls[0][0];
    expect(payload.image).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/ingest.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/ingest.ts`:

```ts
import { eq } from "drizzle-orm";
import { inputs, attachments, categories as categoriesTable } from "@/db/schema";
import type { NormalizedInput } from "./email";
import type { ImageStore } from "./r2";
import type { Classification, ClassifyPayload, CategoryLite } from "./classify";

// `any` so the same code runs against prod postgres.js AND pglite in tests.
// Every call site is covered by tests, so this is a deliberate escape hatch.
type AnyDb = any;

export type Classifier = (payload: ClassifyPayload, cats: CategoryLite[]) => Promise<Classification>;

export type IngestDeps = {
  db: AnyDb;
  store: ImageStore;
  classifier: Classifier;
};

const THIN_TEXT = 20; // chars; below this we lean on the image for vision classification

export async function ingestInput(deps: IngestDeps, input: NormalizedInput): Promise<string | null> {
  const { db, store, classifier } = deps;

  const hasText = input.text.trim().length > 0;
  if (!hasText && input.images.length === 0) {
    throw new Error("empty input: no text and no images");
  }

  // Dedupe by message id.
  if (input.messageId) {
    const existing = await db.select({ id: inputs.id }).from(inputs)
      .where(eq(inputs.messageId, input.messageId)).limit(1);
    if (existing.length > 0) return null;
  }

  // Upload images. A failed upload does not lose the input.
  const uploaded: Array<{ r2Key: string; contentType: string; filename: string | null; status: "ok" | "failed" }> = [];
  for (const img of input.images) {
    try {
      const r2Key = await store.upload(img.buffer, img.contentType);
      uploaded.push({ r2Key, contentType: img.contentType, filename: img.filename, status: "ok" });
    } catch {
      uploaded.push({ r2Key: "", contentType: img.contentType, filename: img.filename, status: "failed" });
    }
  }

  // Classify. Use the first image for vision when text is thin.
  const cats: CategoryLite[] = await db.select({ slug: categoriesTable.slug, name: categoriesTable.name })
    .from(categoriesTable);
  const firstImg = input.images[0];
  const useVision = input.text.trim().length < THIN_TEXT && firstImg;
  const payload: ClassifyPayload = {
    subject: input.subject, text: input.text, sender: input.sender,
    image: useVision ? { base64: firstImg.buffer.toString("base64"), mediaType: firstImg.contentType } : null,
  };
  const result = await classifier(payload, cats);

  // Insert input + attachments.
  const [row] = await db.insert(inputs).values({
    source: input.source,
    categorySlug: result.categorySlug,
    title: result.title,
    bodyText: input.text,
    html: input.html,
    sender: input.sender,
    subject: input.subject,
    summary: result.summary,
    messageId: input.messageId,
  }).returning({ id: inputs.id });

  if (uploaded.length > 0) {
    await db.insert(attachments).values(uploaded.map((u) => ({
      inputId: row.id, r2Key: u.r2Key, contentType: u.contentType,
      filename: u.filename, status: u.status,
    })));
  }
  return row.id;
}
```

> Note on `AnyDb = any`: this lets both the prod client and the pglite test client flow through `ingestInput` and the query functions. It is a deliberate, tested escape hatch — do not try to "fix" it with a union type unless you also thread the pglite type everywhere.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- test/ingest.test.ts`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: shared ingestion pipeline (dedupe, upload, classify, persist)"
```

---

## Task 10: IMAP reader (interface + fake + Gmail impl)

**Files:**
- Create: `src/lib/imap.ts`, `test/imap-fake.test.ts`

- [ ] **Step 1: Write failing test for the fake**

Create `test/imap-fake.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FakeMailReader } from "@/lib/imap";

describe("FakeMailReader", () => {
  it("returns only messages with uid > lastUid, and the max uid", async () => {
    const reader = new FakeMailReader([
      { uid: 1, raw: Buffer.from("a") },
      { uid: 2, raw: Buffer.from("b") },
      { uid: 3, raw: Buffer.from("c") },
    ]);
    const out = await reader.fetchNewMessages(1);
    expect(out.messages.map((m) => m.uid)).toEqual([2, 3]);
    expect(out.maxUid).toBe(3);
  });
  it("reports lastUid as maxUid when nothing is new", async () => {
    const reader = new FakeMailReader([{ uid: 5, raw: Buffer.from("x") }]);
    const out = await reader.fetchNewMessages(5);
    expect(out.messages).toEqual([]);
    expect(out.maxUid).toBe(5);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/imap-fake.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/imap.ts`:

```ts
import { ImapFlow } from "imapflow";

export type RawMessage = { uid: number; raw: Buffer };
export type FetchResult = { messages: RawMessage[]; maxUid: number };

export interface MailReader {
  fetchNewMessages(lastUid: number): Promise<FetchResult>;
}

export class FakeMailReader implements MailReader {
  constructor(private all: RawMessage[]) {}
  async fetchNewMessages(lastUid: number): Promise<FetchResult> {
    const messages = this.all.filter((m) => m.uid > lastUid).sort((a, b) => a.uid - b.uid);
    const maxUid = Math.max(lastUid, ...this.all.map((m) => m.uid), 0);
    return { messages, maxUid };
  }
}

export class GmailImapReader implements MailReader {
  constructor(
    private user = process.env.GMAIL_USER!,
    private pass = process.env.GMAIL_APP_PASSWORD!,
    private target = process.env.GMAIL_TARGET_ADDRESS!,
  ) {}

  async fetchNewMessages(lastUid: number): Promise<FetchResult> {
    const client = new ImapFlow({
      host: "imap.gmail.com", port: 993, secure: true,
      auth: { user: this.user, pass: this.pass }, logger: false,
    });
    await client.connect();
    const messages: RawMessage[] = [];
    let maxUid = lastUid;
    const lock = await client.getMailboxLock("INBOX");
    try {
      // UID range from lastUid+1 up, filtered by destination address.
      const range = `${lastUid + 1}:*`;
      for await (const msg of client.fetch(
        { uid: range },
        { uid: true, source: true, envelope: true },
        { uid: true },
      )) {
        const to = (msg.envelope?.to ?? []).map((a) => a.address?.toLowerCase() ?? "");
        if (!to.includes(this.target.toLowerCase())) continue;
        if (msg.uid <= lastUid) continue; // `n:*` always returns at least the last msg
        messages.push({ uid: msg.uid, raw: msg.source as Buffer });
        if (msg.uid > maxUid) maxUid = msg.uid;
      }
    } finally {
      lock.release();
      await client.logout();
    }
    messages.sort((a, b) => a.uid - b.uid);
    return { messages, maxUid };
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- test/imap-fake.test.ts`
Expected: PASS. (`GmailImapReader` is exercised manually against real Gmail in Task 19.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: IMAP mail reader interface + Gmail impl + fake"
```

---

## Task 11: Poll service + `/api/poll` route

**Files:**
- Create: `src/lib/poll.ts`, `test/poll.test.ts`, `src/app/api/poll/route.ts`

- [ ] **Step 1: Write failing tests for the poll service**

Create `test/poll.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { makeTestDb, seedCategories } from "./helpers/db";
import { runPoll } from "@/lib/poll";
import { FakeMailReader } from "@/lib/imap";
import { pollState, inputs } from "@/db/schema";
import { readFileSync } from "node:fs";
import path from "node:path";

const fx = (n: string) => readFileSync(path.resolve(__dirname, "fixtures", n));
const store = { upload: vi.fn(async () => "inputs/x.png"), publicUrl: (k: string) => k };
const classifier = async () => ({ categorySlug: "ler-depois", title: "T", summary: "S" });

async function initState(db: Awaited<ReturnType<typeof makeTestDb>>) {
  await db.insert(pollState).values({ id: 1, lastUid: 0 });
}

describe("runPoll", () => {
  it("ingests new messages and advances lastUid", async () => {
    const db = await makeTestDb(); await seedCategories(db); await initState(db);
    const reader = new FakeMailReader([
      { uid: 10, raw: fx("plain.eml") },
      { uid: 11, raw: fx("with-image.eml") },
    ]);
    const res = await runPoll({ db, store, classifier, reader });
    expect(res.ingested).toBe(2);
    expect((await db.select().from(inputs)).length).toBe(2);
    const state = await db.select().from(pollState);
    expect(state[0].lastUid).toBe(11);
  });

  it("does not advance past a message that fails to ingest", async () => {
    const db = await makeTestDb(); await seedCategories(db); await initState(db);
    const reader = new FakeMailReader([
      { uid: 10, raw: fx("plain.eml") },
      { uid: 11, raw: fx("with-image.eml") },
    ]);
    // Deterministic failure: classifier throws on the SECOND message only.
    let n = 0;
    const flaky = async () => {
      n += 1;
      if (n === 2) throw new Error("classify failed");
      return { categorySlug: "ler-depois", title: "T", summary: "S" };
    };
    const res = await runPoll({ db, store, classifier: flaky, reader });
    // uid 10 ingests; uid 11 throws inside ingest -> runPoll breaks without advancing.
    expect(res.ingested).toBe(1);
    const state = await db.select().from(pollState);
    expect(state[0].lastUid).toBe(10);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/poll.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the poll service**

Create `src/lib/poll.ts`:

```ts
import { eq } from "drizzle-orm";
import { pollState } from "@/db/schema";
import { parseEmail } from "./email";
import { ingestInput, type IngestDeps } from "./ingest";
import type { MailReader } from "./imap";

let polling = false; // simple in-process lock (single Railway instance)

export type PollDeps = IngestDeps & { reader: MailReader };

export async function runPoll(deps: PollDeps): Promise<{ ingested: number; skipped: boolean }> {
  if (polling) return { ingested: 0, skipped: true };
  polling = true;
  try {
    const { db, reader } = deps;
    const [state] = await db.select().from(pollState).where(eq(pollState.id, 1));
    const lastUid = state?.lastUid ?? 0;

    const { messages } = await reader.fetchNewMessages(lastUid);
    let processedUpTo = lastUid;
    let ingested = 0;

    for (const msg of messages) {
      try {
        const normalized = await parseEmail(msg.raw);
        await ingestInput(deps, normalized);
        processedUpTo = msg.uid; // advance only after success
        ingested += 1;
      } catch (err) {
        console.error(`poll: failed on uid ${msg.uid}, stopping`, err);
        break; // do not skip a message; retry next cycle
      }
    }

    if (processedUpTo > lastUid) {
      await db.update(pollState).set({ lastUid: processedUpTo, updatedAt: new Date() })
        .where(eq(pollState.id, 1));
    }
    return { ingested, skipped: false };
  } finally {
    polling = false;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- test/poll.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the route**

Create `src/app/api/poll/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pollState } from "@/db/schema";
import { runPoll } from "@/lib/poll";
import { R2Store } from "@/lib/r2";
import { GmailImapReader } from "@/lib/imap";
import { classifyInput } from "@/lib/classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-inbound-secret") !== process.env.INBOUND_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Ensure the single poll_state row exists.
  await db.insert(pollState).values({ id: 1, lastUid: 0 }).onConflictDoNothing();

  const res = await runPoll({
    db,
    store: new R2Store(),
    classifier: (payload, cats) => classifyInput(payload, cats),
    reader: new GmailImapReader(),
  });
  return NextResponse.json(res);
}
```

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit
git add -A
git commit -m "feat: poll service + /api/poll route"
```

---

## Task 12: `/api/paste` route

**Files:**
- Create: `src/app/api/paste/route.ts`, `test/paste-normalize.test.ts`, `src/lib/paste.ts`

Extract the multipart→NormalizedInput mapping into a pure, tested helper; the route wires deps.

- [ ] **Step 1: Write failing test for the mapper**

Create `test/paste-normalize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizePaste } from "@/lib/paste";

describe("normalizePaste", () => {
  it("builds a paste NormalizedInput from text + files", () => {
    const n = normalizePaste("meu texto", [
      { buffer: Buffer.from("x"), contentType: "image/png", filename: "a.png" },
    ]);
    expect(n.source).toBe("paste");
    expect(n.text).toBe("meu texto");
    expect(n.images).toHaveLength(1);
    expect(n.messageId).toBeNull();
    expect(n.subject).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/paste-normalize.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the mapper**

Create `src/lib/paste.ts`:

```ts
import type { NormalizedInput, ImagePart } from "./email";

export function normalizePaste(text: string, images: ImagePart[]): NormalizedInput {
  return {
    source: "paste",
    sender: null,
    subject: null,
    text: text.trim(),
    html: null,
    messageId: null,
    images,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- test/paste-normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the route**

Create `src/app/api/paste/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ingestInput } from "@/lib/ingest";
import { normalizePaste } from "@/lib/paste";
import { R2Store } from "@/lib/r2";
import { classifyInput } from "@/lib/classify";
import type { ImagePart } from "@/lib/email";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per image

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const text = String(form.get("text") ?? "");
  const files = form.getAll("images").filter((f): f is File => f instanceof File);

  const images: ImagePart[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "apenas imagens" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "imagem muito grande (máx 10MB)" }, { status: 400 });
    }
    images.push({
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      filename: file.name || null,
    });
  }

  if (!text.trim() && images.length === 0) {
    return NextResponse.json({ error: "input vazio" }, { status: 400 });
  }

  try {
    const id = await ingestInput(
      { db, store: new R2Store(), classifier: (p, c) => classifyInput(p, c) },
      normalizePaste(text, images),
    );
    return NextResponse.json({ id });
  } catch (err) {
    console.error("paste failed", err);
    return NextResponse.json({ error: "falha ao salvar" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit
git add -A
git commit -m "feat: /api/paste route + paste normalizer"
```

---

## Task 13: Feed query + `/api/feed` route

**Files:**
- Create: `src/lib/queries.ts`, `test/feed-query.test.ts`, `src/app/api/feed/route.ts`

- [ ] **Step 1: Write failing tests**

Create `test/feed-query.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeTestDb, seedCategories } from "./helpers/db";
import { getFeed } from "@/lib/queries";
import { inputs } from "@/db/schema";

async function insert(db: Awaited<ReturnType<typeof makeTestDb>>, over: Record<string, unknown>) {
  const [r] = await db.insert(inputs).values({
    source: "paste", categorySlug: "ler-depois", title: "t", bodyText: "b", ...over,
  }).returning({ id: inputs.id, createdAt: inputs.createdAt });
  return r;
}

describe("getFeed", () => {
  it("returns only unread, newest first, and paginates via cursor", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    for (let i = 0; i < 25; i++) {
      await insert(db, { title: `n${i}`, createdAt: new Date(2026, 0, 1, 0, i) });
    }
    await insert(db, { title: "lido", readAt: new Date(), createdAt: new Date(2026, 0, 2) });

    const page1 = await getFeed(db, { limit: 20 });
    expect(page1.items).toHaveLength(20);
    expect(page1.items[0].title).toBe("n24"); // newest unread
    expect(page1.nextCursor).toBeTruthy();
    expect(page1.items.some((i) => i.title === "lido")).toBe(false);

    const page2 = await getFeed(db, { limit: 20, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(5);
    expect(page2.nextCursor).toBeNull();
  });

  it("filters by category", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    await insert(db, { title: "a", categorySlug: "ler-depois" });
    await insert(db, { title: "b", categorySlug: "inspiracao" });
    const res = await getFeed(db, { limit: 20, category: "inspiracao" });
    expect(res.items.map((i) => i.title)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/feed-query.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the query module**

Create `src/lib/queries.ts`:

```ts
import { and, eq, isNull, isNotNull, sql, desc } from "drizzle-orm";
import { inputs, attachments } from "@/db/schema";
import { encodeCursor, decodeCursor } from "./cursor";

export type FeedItem = {
  id: string;
  source: string;
  categorySlug: string;
  title: string;
  summary: string | null;
  bodyText: string;
  sender: string | null;
  createdAt: string;
  images: { r2Key: string; status: string }[];
};

type FeedArgs = { limit: number; cursor?: string | null; category?: string | null };

async function attachImages(db: any, items: any[]): Promise<FeedItem[]> {
  if (items.length === 0) return [];
  const ids = items.map((i) => i.id);
  const atts = await db.select().from(attachments)
    .where(sql`${attachments.inputId} in ${ids}`);
  const byInput = new Map<string, { r2Key: string; status: string }[]>();
  for (const a of atts) {
    const list = byInput.get(a.inputId) ?? [];
    list.push({ r2Key: a.r2Key, status: a.status });
    byInput.set(a.inputId, list);
  }
  return items.map((i) => ({
    id: i.id, source: i.source, categorySlug: i.categorySlug, title: i.title,
    summary: i.summary, bodyText: i.bodyText, sender: i.sender,
    createdAt: new Date(i.createdAt).toISOString(),
    images: byInput.get(i.id) ?? [],
  }));
}

function cursorClause(cursor?: string | null) {
  if (!cursor) return undefined;
  const c = decodeCursor(cursor);
  if (!c) return undefined;
  return sql`(${inputs.createdAt}, ${inputs.id}) < (${new Date(c.createdAt)}, ${c.id})`;
}

function pageResult(rows: FeedItem[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;
  return { items, nextCursor };
}

export async function getFeed(db: any, args: FeedArgs) {
  const conds = [isNull(inputs.readAt)];
  if (args.category) conds.push(eq(inputs.categorySlug, args.category));
  const cur = cursorClause(args.cursor);
  if (cur) conds.push(cur);

  const rows = await db.select().from(inputs)
    .where(and(...conds))
    .orderBy(desc(inputs.createdAt), desc(inputs.id))
    .limit(args.limit + 1);

  const withImages = await attachImages(db, rows);
  return pageResult(withImages, args.limit);
}

export async function getArchive(db: any, args: FeedArgs & { q?: string | null }) {
  const conds = [isNotNull(inputs.readAt)];
  if (args.category) conds.push(eq(inputs.categorySlug, args.category));
  if (args.q && args.q.trim()) {
    conds.push(sql`to_tsvector('portuguese', coalesce(${inputs.title},'') || ' ' || coalesce(${inputs.bodyText},'')) @@ plainto_tsquery('portuguese', ${args.q.trim()})`);
  }
  const cur = cursorClause(args.cursor);
  if (cur) conds.push(cur);

  const rows = await db.select().from(inputs)
    .where(and(...conds))
    .orderBy(desc(inputs.createdAt), desc(inputs.id))
    .limit(args.limit + 1);

  const withImages = await attachImages(db, rows);
  return pageResult(withImages, args.limit);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- test/feed-query.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the route**

Create `src/app/api/feed/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getFeed } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const res = await getFeed(db, {
    limit: 20,
    cursor: searchParams.get("cursor"),
    category: searchParams.get("category"),
  });
  return NextResponse.json(res);
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: feed query + /api/feed route"
```

---

## Task 14: Archive route + full-text search test

**Files:**
- Create: `test/archive-query.test.ts`, `src/app/api/archive/route.ts`

`getArchive` already exists (Task 13). This task tests FTS behavior and adds the route.

- [ ] **Step 1: Write failing tests**

Create `test/archive-query.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeTestDb, seedCategories } from "./helpers/db";
import { getArchive } from "@/lib/queries";
import { inputs } from "@/db/schema";

async function insertRead(db: any, over: Record<string, unknown>) {
  await db.insert(inputs).values({
    source: "paste", categorySlug: "ler-depois", title: "t", bodyText: "b",
    readAt: new Date(), ...over,
  });
}

describe("getArchive", () => {
  it("returns only read items", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    await insertRead(db, { title: "arquivado" });
    await db.insert(inputs).values({ source: "paste", categorySlug: "ler-depois", title: "novo", bodyText: "b" });
    const res = await getArchive(db, { limit: 20 });
    expect(res.items.map((i) => i.title)).toEqual(["arquivado"]);
  });

  it("matches full-text search on title and body", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    await insertRead(db, { title: "Design tipográfico", bodyText: "sobre fontes" });
    await insertRead(db, { title: "Receita de bolo", bodyText: "farinha e ovos" });
    const res = await getArchive(db, { limit: 20, q: "fontes" });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].title).toBe("Design tipográfico");
  });
});
```

- [ ] **Step 2: Run to verify failure/pass**

Run: `npm test -- test/archive-query.test.ts`
Expected: PASS (getArchive already implemented). If FTS fails in pglite, confirm pglite version supports `plainto_tsquery('portuguese', …)`; the `portuguese` config ships with Postgres core and pglite. If PASS, continue.

- [ ] **Step 3: Write the route**

Create `src/app/api/archive/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getArchive } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const res = await getArchive(db, {
    limit: 20,
    cursor: searchParams.get("cursor"),
    category: searchParams.get("category"),
    q: searchParams.get("q"),
  });
  return NextResponse.json(res);
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: archive query FTS + /api/archive route"
```

---

## Task 15: Mark-as-read route

**Files:**
- Create: `src/lib/queries.ts` (add `markRead`), `test/mark-read.test.ts`, `src/app/api/inputs/[id]/read/route.ts`

- [ ] **Step 1: Write failing test**

Create `test/mark-read.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeTestDb, seedCategories } from "./helpers/db";
import { markRead, getFeed, getArchive } from "@/lib/queries";
import { inputs } from "@/db/schema";

describe("markRead", () => {
  it("moves an item from feed to archive", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const [row] = await db.insert(inputs).values({
      source: "paste", categorySlug: "ler-depois", title: "x", bodyText: "b",
    }).returning({ id: inputs.id });

    expect((await getFeed(db, { limit: 20 })).items).toHaveLength(1);
    const ok = await markRead(db, row.id);
    expect(ok).toBe(true);

    expect((await getFeed(db, { limit: 20 })).items).toHaveLength(0);
    expect((await getArchive(db, { limit: 20 })).items).toHaveLength(1);
  });

  it("returns false for an unknown id", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    expect(await markRead(db, "00000000-0000-0000-0000-000000000000")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/mark-read.test.ts`
Expected: FAIL (`markRead` not exported).

- [ ] **Step 3: Add `markRead` to `src/lib/queries.ts`**

Append to `src/lib/queries.ts`:

```ts
import { } from "drizzle-orm"; // (already imported above; do not duplicate)

export async function markRead(db: any, id: string): Promise<boolean> {
  const res = await db.update(inputs)
    .set({ readAt: new Date() })
    .where(and(eq(inputs.id, id), isNull(inputs.readAt)))
    .returning({ id: inputs.id });
  return res.length > 0;
}
```

> Reuse the existing `and`, `eq`, `isNull` imports at the top of the file — do not add a second import line. The empty import above is illustrative; delete it.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- test/mark-read.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the route**

Create `src/app/api/inputs/[id]/read/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { markRead } from "@/lib/queries";

export const runtime = "nodejs";

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await markRead(db, id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: mark-as-read query + route"
```

---

## Task 16: Categories management + route

**Files:**
- Create: `src/lib/categoriesRepo.ts`, `test/categories-repo.test.ts`, `src/app/api/categories/route.ts`

- [ ] **Step 1: Write failing tests**

Create `test/categories-repo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeTestDb, seedCategories } from "./helpers/db";
import { listCategories, addCategory, renameCategory, deleteCategory } from "@/lib/categoriesRepo";
import { inputs } from "@/db/schema";

describe("categoriesRepo", () => {
  it("lists seeded categories ordered", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const cats = await listCategories(db);
    expect(cats.map((c) => c.slug)).toEqual(["ler-depois", "inspiracao", "pessoal", "outros"]);
  });

  it("adds a category with a derived slug", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const c = await addCategory(db, "Trabalho");
    expect(c.slug).toBe("trabalho");
    expect((await listCategories(db)).some((x) => x.slug === "trabalho")).toBe(true);
  });

  it("renames without changing the slug", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    await renameCategory(db, "pessoal", "Vida pessoal");
    const cats = await listCategories(db);
    expect(cats.find((c) => c.slug === "pessoal")!.name).toBe("Vida pessoal");
  });

  it("reassigns inputs to 'outros' on delete", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    await addCategory(db, "Temp");
    await db.insert(inputs).values({ source: "paste", categorySlug: "temp", title: "t", bodyText: "b" });
    await deleteCategory(db, "temp");
    const rows = await db.select().from(inputs);
    expect(rows[0].categorySlug).toBe("outros");
    expect((await listCategories(db)).some((c) => c.slug === "temp")).toBe(false);
  });

  it("refuses to delete the outros fallback", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    await expect(deleteCategory(db, "outros")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/categories-repo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/categoriesRepo.ts`:

```ts
import { eq, asc, sql } from "drizzle-orm";
import { categories, inputs } from "@/db/schema";
import { slugify, OUTROS_SLUG } from "./categories";

export async function listCategories(db: any) {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function addCategory(db: any, name: string) {
  const slug = slugify(name);
  if (!slug) throw new Error("nome inválido");
  const [maxRow] = await db.select({ m: sql<number>`coalesce(max(${categories.sortOrder}), 0)` }).from(categories);
  const [row] = await db.insert(categories)
    .values({ slug, name, sortOrder: (maxRow?.m ?? 0) + 1 })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new Error("categoria já existe");
  return row;
}

export async function renameCategory(db: any, slug: string, name: string) {
  await db.update(categories).set({ name }).where(eq(categories.slug, slug));
}

export async function deleteCategory(db: any, slug: string) {
  if (slug === OUTROS_SLUG) throw new Error("não é possível remover 'outros'");
  await db.update(inputs).set({ categorySlug: OUTROS_SLUG }).where(eq(inputs.categorySlug, slug));
  await db.delete(categories).where(eq(categories.slug, slug));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- test/categories-repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the route**

Create `src/app/api/categories/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { listCategories, addCategory, renameCategory, deleteCategory } from "@/lib/categoriesRepo";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ categories: await listCategories(db) });
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  try {
    const cat = await addCategory(db, String(name ?? ""));
    return NextResponse.json({ category: cat });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const { slug, name } = await req.json();
  await renameCategory(db, String(slug), String(name));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { slug } = await req.json();
  try {
    await deleteCategory(db, String(slug));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: categories repo + /api/categories CRUD"
```

---

## Task 17: URL-secret auth middleware

**Files:**
- Create: `src/lib/auth.ts`, `test/auth.test.ts`, `src/middleware.ts`

- [ ] **Step 1: Write failing test for the pure check**

Create `test/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isAuthed, AUTH_COOKIE } from "@/lib/auth";

describe("isAuthed", () => {
  it("passes when the cookie matches the secret", () => {
    expect(isAuthed("s3cr3t", "s3cr3t")).toBe(true);
  });
  it("fails when it does not match or is missing", () => {
    expect(isAuthed("nope", "s3cr3t")).toBe(false);
    expect(isAuthed(undefined, "s3cr3t")).toBe(false);
  });
  it("exposes a cookie name", () => {
    expect(AUTH_COOKIE).toBe("portal_auth");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the helper**

Create `src/lib/auth.ts`:

```ts
export const AUTH_COOKIE = "portal_auth";

export function isAuthed(cookieValue: string | undefined, secret: string): boolean {
  return !!cookieValue && !!secret && cookieValue === secret;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- test/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the middleware**

Create `src/middleware.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, isAuthed } from "@/lib/auth";

// Everything except /api/poll (own secret), Next internals, and static assets.
export const config = {
  matcher: ["/((?!api/poll|_next/static|_next/image|favicon.ico).*)"],
};

export function middleware(req: NextRequest) {
  const secret = process.env.PORTAL_SECRET ?? "";
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (isAuthed(cookie, secret)) return NextResponse.next();

  const k = req.nextUrl.searchParams.get("k");
  if (k && k === secret) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("k");
    const res = NextResponse.redirect(url);
    res.cookies.set(AUTH_COOKIE, secret, {
      httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  }

  return new NextResponse("403 — acesso restrito", { status: 403 });
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: URL-secret auth middleware"
```

---

## Task 18: Seed script + UI (feed, composer, archive, settings)

**Files:**
- Create: `scripts/seed.ts`, `src/app/globals.css` (extend), `src/app/layout.tsx` (edit), `src/app/page.tsx`, `src/components/*`, `src/app/arquivo/page.tsx`, `src/app/ajustes/page.tsx`

UI is verified by running the app (Task 19), not unit tests.

- [ ] **Step 1: Seed script**

Create `scripts/seed.ts`:

```ts
import "dotenv/config";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { DEFAULT_CATEGORIES } from "@/lib/categories";

async function main() {
  await db.insert(categories).values(DEFAULT_CATEGORIES).onConflictDoNothing();
  console.log("seeded categories");
  process.exit(0);
}
main();
```

Note: `tsx` must resolve the `@/*` alias. Add to `package.json` a `"tsx"` note is unnecessary — instead run with the alias via `tsconfig-paths`. Simplest: change the two script imports to relative paths (`../src/db`, etc.) OR install `tsconfig-paths` and run `tsx -r tsconfig-paths/register scripts/seed.ts`. Use relative imports in `scripts/*` to avoid extra deps:

```ts
// scripts/seed.ts (relative-import version)
import "dotenv/config";
import { db } from "../src/db";
import { categories } from "../src/db/schema";
import { DEFAULT_CATEGORIES } from "../src/lib/categories";
```

- [ ] **Step 2: Root layout with nav**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = { title: "Portal de Inputs", description: "Feed pessoal" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur">
          <nav className="mx-auto flex max-w-2xl items-center gap-6 px-4 py-3 text-sm font-medium">
            <Link href="/" className="hover:underline">Feed</Link>
            <Link href="/arquivo" className="hover:underline">Arquivo</Link>
            <Link href="/ajustes" className="ml-auto text-neutral-500 hover:underline">Ajustes</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Feed page (server) + client components**

Create `src/app/page.tsx`:

```tsx
import { db } from "@/db";
import { getFeed } from "@/lib/queries";
import { listCategories } from "@/lib/categoriesRepo";
import Composer from "@/components/Composer";
import Feed from "@/components/Feed";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [initial, cats] = await Promise.all([
    getFeed(db, { limit: 20 }),
    listCategories(db),
  ]);
  return (
    <div className="space-y-6">
      <Composer />
      <Feed
        initialItems={initial.items}
        initialCursor={initial.nextCursor}
        categories={cats.map((c: any) => ({ slug: c.slug, name: c.name }))}
      />
    </div>
  );
}
```

Create `src/components/CategoryChips.tsx`:

```tsx
"use client";
export default function CategoryChips({
  categories, active, onChange,
}: {
  categories: { slug: string; name: string }[];
  active: string | null;
  onChange: (slug: string | null) => void;
}) {
  const base = "rounded-full border px-3 py-1 text-xs transition";
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => onChange(null)}
        className={`${base} ${active === null ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}>
        Tudo
      </button>
      {categories.map((c) => (
        <button key={c.slug} onClick={() => onChange(c.slug)}
          className={`${base} ${active === c.slug ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}>
          {c.name}
        </button>
      ))}
    </div>
  );
}
```

Create `src/components/InputCard.tsx`:

```tsx
"use client";
import { useState } from "react";

export type Item = {
  id: string; source: string; categorySlug: string; title: string;
  summary: string | null; bodyText: string; sender: string | null;
  createdAt: string; images: { r2Key: string; status: string }[];
};

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

export default function InputCard({ item, onRead }: { item: Item; onRead: (id: string) => void }) {
  const [leaving, setLeaving] = useState(false);
  const time = new Date(item.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  async function markRead() {
    setLeaving(true);
    await fetch(`/api/inputs/${item.id}/read`, { method: "PATCH" });
    onRead(item.id);
  }

  return (
    <article className={`rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition ${leaving ? "opacity-0" : "opacity-100"}`}>
      <div className="mb-1 flex items-center gap-2 text-xs text-neutral-500">
        <span className="rounded bg-neutral-100 px-2 py-0.5">{item.categorySlug}</span>
        <span>{item.source === "email" ? "e-mail" : "colado"}</span>
        <span className="ml-auto">{time}</span>
      </div>
      <h3 className="font-semibold">{item.title}</h3>
      {item.summary && <p className="mt-1 text-sm text-neutral-600">{item.summary}</p>}
      {item.images.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {item.images.map((img, i) =>
            img.status === "ok" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={`${R2_PUBLIC}/${img.r2Key}`} alt="" className="h-28 rounded-lg object-cover" />
            ) : (
              <div key={i} className="flex h-28 w-28 items-center justify-center rounded-lg bg-neutral-100 text-xs text-neutral-400">
                imagem indisponível
              </div>
            ),
          )}
        </div>
      )}
      <button onClick={markRead}
        className="mt-3 rounded-lg border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-900 hover:text-white">
        Marcar como lido
      </button>
    </article>
  );
}
```

Create `src/components/Feed.tsx`:

```tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import CategoryChips from "./CategoryChips";
import InputCard, { type Item } from "./InputCard";

export default function Feed({
  initialItems, initialCursor, categories,
}: {
  initialItems: Item[]; initialCursor: string | null;
  categories: { slug: string; name: string }[];
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [category, setCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(async (reset: boolean, cat: string | null, cur: string | null) => {
    if (loading) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (cat) params.set("category", cat);
    if (!reset && cur) params.set("cursor", cur);
    const res = await fetch(`/api/feed?${params}`).then((r) => r.json());
    setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
    setCursor(res.nextCursor);
    setLoading(false);
  }, [loading]);

  function changeCategory(cat: string | null) {
    setCategory(cat);
    setItems([]);
    setCursor(null);
    load(true, cat, null);
  }

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && cursor && !loading) load(false, category, cursor);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loading, category, load]);

  function onRead(id: string) {
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 150);
  }

  return (
    <div className="space-y-4">
      <CategoryChips categories={categories} active={category} onChange={changeCategory} />
      {items.length === 0 && !loading && (
        <p className="py-12 text-center text-sm text-neutral-400">Nada por aqui. Inbox zero. ✨</p>
      )}
      {items.map((item) => <InputCard key={item.id} item={item} onRead={onRead} />)}
      <div ref={sentinel} className="h-8" />
      {loading && <p className="text-center text-sm text-neutral-400">carregando…</p>}
    </div>
  );
}
```

Create `src/components/Composer.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Composer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPaste(e: React.ClipboardEvent) {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) setFiles((prev) => [...prev, ...imgs]);
  }

  async function submit() {
    if (!text.trim() && files.length === 0) return;
    setBusy(true); setError(null);
    const form = new FormData();
    form.set("text", text);
    files.forEach((f) => form.append("images", f));
    const res = await fetch("/api/paste", { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error ?? "erro"); return; }
    setText(""); setFiles([]);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        placeholder="Cole um screenshot ou escreva um input…"
        className="min-h-20 w-full resize-y rounded-lg border border-neutral-200 p-2 text-sm outline-none focus:border-neutral-400"
      />
      {files.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {files.map((f, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={URL.createObjectURL(f)} alt="" className="h-16 rounded object-cover" />
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-2 flex justify-end">
        <button onClick={submit} disabled={busy}
          className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-50">
          {busy ? "salvando…" : "Adicionar"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Archive page**

Create `src/components/ArchiveView.tsx`:

```tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import CategoryChips from "./CategoryChips";
import InputCard, { type Item } from "./InputCard";

export default function ArchiveView({ categories }: { categories: { slug: string; name: string }[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(async (reset: boolean, cur: string | null) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (q.trim()) params.set("q", q.trim());
    if (!reset && cur) params.set("cursor", cur);
    const res = await fetch(`/api/archive?${params}`).then((r) => r.json());
    setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
    setCursor(res.nextCursor);
    setLoading(false);
  }, [category, q]);

  useEffect(() => { load(true, null); }, [load]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && cursor && !loading) load(false, cursor);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loading, load]);

  return (
    <div className="space-y-4">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no arquivo…"
        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
      <CategoryChips categories={categories} active={category} onChange={setCategory} />
      {items.map((item) => <InputCard key={item.id} item={item} onRead={() => {}} />)}
      <div ref={sentinel} className="h-8" />
      {loading && <p className="text-center text-sm text-neutral-400">carregando…</p>}
    </div>
  );
}
```

Create `src/app/arquivo/page.tsx`:

```tsx
import { db } from "@/db";
import { listCategories } from "@/lib/categoriesRepo";
import ArchiveView from "@/components/ArchiveView";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const cats = await listCategories(db);
  return <ArchiveView categories={cats.map((c: any) => ({ slug: c.slug, name: c.name }))} />;
}
```

- [ ] **Step 5: Settings page (categories)**

Create `src/components/CategoryManager.tsx`:

```tsx
"use client";
import { useState } from "react";

type Cat = { slug: string; name: string };

export default function CategoryManager({ initial }: { initial: Cat[] }) {
  const [cats, setCats] = useState<Cat[]>(initial);
  const [name, setName] = useState("");

  async function add() {
    if (!name.trim()) return;
    const res = await fetch("/api/categories", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) { const { category } = await res.json(); setCats((c) => [...c, category]); setName(""); }
  }
  async function remove(slug: string) {
    const res = await fetch("/api/categories", {
      method: "DELETE", headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (res.ok) setCats((c) => c.filter((x) => x.slug !== slug));
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Categorias</h2>
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {cats.map((c) => (
          <li key={c.slug} className="flex items-center justify-between px-3 py-2 text-sm">
            <span>{c.name} <span className="text-neutral-400">({c.slug})</span></span>
            {c.slug !== "outros" && (
              <button onClick={() => remove(c.slug)} className="text-red-600 hover:underline">remover</button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria"
          className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
        <button onClick={add} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">Adicionar</button>
      </div>
    </div>
  );
}
```

Create `src/app/ajustes/page.tsx`:

```tsx
import { db } from "@/db";
import { listCategories } from "@/lib/categoriesRepo";
import CategoryManager from "@/components/CategoryManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cats = await listCategories(db);
  return <CategoryManager initial={cats.map((c: any) => ({ slug: c.slug, name: c.name }))} />;
}
```

- [ ] **Step 6: Expose the R2 public URL to the client**

In `.env.example` and your real `.env`, add:

```bash
NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-xxxx.r2.dev
```

(Same value as `R2_PUBLIC_URL`; `NEXT_PUBLIC_` makes it available in `InputCard.tsx`.)

- [ ] **Step 7: Typecheck, build, commit**

```bash
npx tsc --noEmit
npm run build
git add -A
git commit -m "feat: UI — feed, composer, archive, category settings + seed script"
```
Expected: build succeeds.

---

## Task 19: `simular-inbound` script + local end-to-end verification

**Files:**
- Create: `scripts/simular-inbound.ts`

- [ ] **Step 1: Write the script**

Create `scripts/simular-inbound.ts`:

```ts
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
```

> `Date.now()` here runs in a plain Node script (not a workflow), so it is fine.

- [ ] **Step 2: Prepare a local Postgres and env**

```bash
# Start a local Postgres (or use Railway's DATABASE_URL). Example with Docker:
docker run -d --name portal-pg -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=portal_inputs -p 5432:5432 postgres:16
```

Create `.env` from `.env.example` and fill: `DATABASE_URL`, `ANTHROPIC_API_KEY`, all `R2_*`, `PORTAL_SECRET`, `INBOUND_SECRET`, `NEXT_PUBLIC_R2_PUBLIC_URL`. (Gmail vars only needed for the real poll in Step 6.)

- [ ] **Step 3: Push schema and seed**

```bash
npm run db:push
npm run seed
```
Expected: tables created; "seeded categories".

- [ ] **Step 4: Simulate an input and run the app**

```bash
npm run simular-inbound -- "Um artigo sobre tipografia que quero ler depois"
npm run dev
```
Then open `http://localhost:3000/?k=<PORTAL_SECRET>`.
Expected: redirect to `/`, the simulated input appears in the feed with an AI title/category. Access without `?k=` → 403.

- [ ] **Step 5: Verify the core loops manually**

- Paste text in the composer → click Adicionar → appears in feed.
- Paste a screenshot (Cmd+V into the textarea) → thumbnail shows → Adicionar → card shows the image (served from R2).
- Click "Marcar como lido" → card fades out → appears under `/arquivo`.
- In `/arquivo`, type a word from the item → it filters via full-text search.
- In `/ajustes`, add a category → appears; it shows up as a chip on the feed after refresh.

- [ ] **Step 6: Verify the real Gmail poll (optional but recommended)**

Fill `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_TARGET_ADDRESS` in `.env`. Send/forward a test email to `latenewsfeed+f.drudi@gmail.com`, then:

```bash
curl -X POST http://localhost:3000/api/poll -H "x-inbound-secret: <INBOUND_SECRET>"
```
Expected: `{"ingested":1,...}` and the email appears in the feed. Wrong/missing header → 401.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: simular-inbound script + verified end-to-end locally"
```

---

## Task 20: Deploy config (Railway) + cron + README

**Files:**
- Create: `README.md`, `railway.json` (optional)

- [ ] **Step 1: Write the README with deploy steps**

Create `README.md` documenting: env vars (from `.env.example`), `npm run db:push` on first deploy, and the two external setups below. Include exactly:

```markdown
# Portal de Inputs

Feed pessoal inbox-zero. Inputs por e-mail (Gmail via IMAP) ou colados.

## Deploy (Railway)
1. Crie o projeto, adicione o plugin **Postgres** (define `DATABASE_URL`).
2. Configure todas as env vars de `.env.example` (incluindo `NEXT_PUBLIC_R2_PUBLIC_URL`).
3. Rode a migração uma vez: `npm run db:push` (via Railway shell) e `npm run seed`.
4. Deploy do serviço web (`npm run build` / `npm start`).

## Cron (poll do Gmail)
Crie um **Cron** no Railway (a cada 1 min: `* * * * *`) que executa:
```
curl -fsS -X POST "$APP_URL/api/poll" -H "x-inbound-secret: $INBOUND_SECRET"
```
Defina `APP_URL` e `INBOUND_SECRET` nas variáveis do serviço de cron.

## Gmail
- Conta `latenewsfeed@gmail.com` com 2FA ligado → gere uma **senha de app** → `GMAIL_APP_PASSWORD`.
- Encaminhe/envie inputs para `latenewsfeed+f.drudi@gmail.com`.

## Cloudflare R2
- Crie um bucket, gere Access Key/Secret, habilite acesso público (r2.dev) → preencha `R2_*`.

## Acesso
Abra `https://<app>/?k=<PORTAL_SECRET>` uma vez para gravar o cookie.
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```
Expected: all tests PASS.

- [ ] **Step 3: Final typecheck + build**

```bash
npx tsc --noEmit && npm run build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: README with Railway deploy + cron + Gmail/R2 setup"
```

---

## Notes for the implementer

- **`any` on db params:** the query/repo/ingest functions type `db` as `any` so the same code runs against prod `postgres.js` and test `pglite`. This is intentional; all call sites are covered by tests.
- **Do not add real network calls in tests.** Anthropic, R2, and IMAP are always injected as fakes/mocks in tests. Only Task 19 touches real services, manually.
- **Commit after every green step.** Keep commits small.
- **`portuguese` FTS config:** if a future dataset needs accent-insensitive search, add `unaccent`; out of scope for v1.
```
