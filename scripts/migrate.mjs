// Runs on every Railway deploy (preDeployCommand). Idempotent:
// - drizzle migrator tracks applied migrations in __drizzle_migrations, so tables
//   are created once and never re-run.
// - categories are upserted with ON CONFLICT DO NOTHING.
// Uses only production deps (postgres, drizzle-orm) — no tsx/devDeps needed.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("migrate: DATABASE_URL not set");
  process.exit(1);
}

const DEFAULT_CATEGORIES = [
  { slug: "ler-depois", name: "Ler / Ver depois", sortOrder: 0 },
  { slug: "inspiracao", name: "Inspiração / Referência", sortOrder: 1 },
  { slug: "pessoal", name: "Pessoal / Vida", sortOrder: 2 },
  { slug: "outros", name: "Outros", sortOrder: 3 },
];

const sql = postgres(url, { max: 1 });
try {
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("migrate: schema up to date");
  for (const c of DEFAULT_CATEGORIES) {
    await sql`insert into categories (slug, name, sort_order)
              values (${c.slug}, ${c.name}, ${c.sortOrder})
              on conflict (slug) do nothing`;
  }
  console.log("migrate: categories seeded");
} finally {
  await sql.end();
}
