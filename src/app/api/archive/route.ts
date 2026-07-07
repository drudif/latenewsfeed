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
