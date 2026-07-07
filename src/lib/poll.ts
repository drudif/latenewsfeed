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
