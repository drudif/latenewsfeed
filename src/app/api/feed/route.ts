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
