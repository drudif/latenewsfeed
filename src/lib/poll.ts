import { eq } from "drizzle-orm";
import { pollState } from "@/db/schema";
import { parseEmail } from "./email";
import { ingestInput, EmptyInputError, type IngestDeps } from "./ingest";
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
      const track = msg.trackUid !== false; // spam (false) não avança o lastUid do INBOX
      let normalized;
      try {
        normalized = await parseEmail(msg.raw);
      } catch (err) {
        // Unparseable MIME will never succeed — skip past it so it can't block the queue.
        console.error(`poll: unparseable message uid ${msg.uid}, skipping`, err);
        if (track) processedUpTo = msg.uid;
        continue;
      }
      // Mensagem não rastreada (spam) sem Message-ID não teria dedup → seria
      // reinserida a cada ciclo. Só ingere spam com Message-ID.
      if (!track && !normalized.messageId) continue;
      try {
        const id = await ingestInput(deps, normalized);
        if (track) processedUpTo = msg.uid; // advance only after success
        if (id) ingested += 1; // id null = duplicata (dedup), não conta
      } catch (err) {
        if (err instanceof EmptyInputError) {
          // Nothing ingestable (no text, no image) — skip past it, don't block newer mail.
          console.error(`poll: empty message uid ${msg.uid}, skipping`, err);
          if (track) processedUpTo = msg.uid;
          continue;
        }
        // Transient failure (e.g. DB) — stop and retry from here next cycle.
        console.error(`poll: transient failure on uid ${msg.uid}, stopping`, err);
        break;
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
