import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { markRead } from "@/lib/queries";

export const runtime = "nodejs";

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await markRead(db, id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
