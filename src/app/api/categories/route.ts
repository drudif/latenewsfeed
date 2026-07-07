import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { listCategories, addCategory, renameCategory, deleteCategory } from "@/lib/categoriesRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  try {
    await renameCategory(db, String(slug), String(name));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
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
