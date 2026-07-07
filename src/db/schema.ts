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
