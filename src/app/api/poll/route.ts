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
