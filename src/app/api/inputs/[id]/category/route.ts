import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { inputs, categories } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { categorySlug } = await req.json();
  const slug = String(categorySlug ?? "");
  const [cat] = await db.select({ slug: categories.slug }).from(categories)
    .where(eq(categories.slug, slug)).limit(1);
  if (!cat) return NextResponse.json({ error: "categoria inválida" }, { status: 400 });
  const res = await db.update(inputs).set({ categorySlug: slug })
    .where(eq(inputs.id, id)).returning({ id: inputs.id });
  return NextResponse.json({ ok: res.length > 0 }, { status: res.length > 0 ? 200 : 404 });
}
