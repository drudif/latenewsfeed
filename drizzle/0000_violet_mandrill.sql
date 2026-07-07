CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"input_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"filename" text,
	"status" text DEFAULT 'ok' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"category_slug" text NOT NULL,
	"title" text NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"html" text,
	"sender" text,
	"subject" text,
	"summary" text,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "poll_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"last_uid" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_input_id_inputs_id_fk" FOREIGN KEY ("input_id") REFERENCES "public"."inputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inputs" ADD CONSTRAINT "inputs_category_slug_categories_slug_fk" FOREIGN KEY ("category_slug") REFERENCES "public"."categories"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inputs_message_id_unique" ON "inputs" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "inputs_feed_idx" ON "inputs" USING btree ("read_at","created_at");