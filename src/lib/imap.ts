import { ImapFlow } from "imapflow";

export type RawMessage = { uid: number; raw: Buffer };
export type FetchResult = { messages: RawMessage[]; maxUid: number };

export interface MailReader {
  fetchNewMessages(lastUid: number): Promise<FetchResult>;
}

type EnvelopeLike = {
  to?: Array<{ address?: string | null }> | null;
  from?: Array<{ address?: string | null }> | null;
};

export function parseSenders(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// A message is accepted only if it was delivered to `target` AND, when an
// allowlist is configured, its sender is one of `allowedSenders`. An empty
// allowlist means "any sender" (backwards compatible).
export function acceptsEnvelope(
  envelope: EnvelopeLike | undefined,
  target: string,
  allowedSenders: string[],
): boolean {
  const to = (envelope?.to ?? []).map((a) => (a.address ?? "").toLowerCase());
  if (!to.includes(target.toLowerCase())) return false;
  if (allowedSenders.length > 0) {
    const from = (envelope?.from ?? []).map((a) => (a.address ?? "").toLowerCase());
    if (!from.some((f) => allowedSenders.includes(f))) return false;
  }
  return true;
}

export class FakeMailReader implements MailReader {
  constructor(private all: RawMessage[]) {}
  async fetchNewMessages(lastUid: number): Promise<FetchResult> {
    const messages = this.all.filter((m) => m.uid > lastUid).sort((a, b) => a.uid - b.uid);
    const maxUid = Math.max(lastUid, ...this.all.map((m) => m.uid), 0);
    return { messages, maxUid };
  }
}

export class GmailImapReader implements MailReader {
  constructor(
    private user = process.env.GMAIL_USER!,
    private pass = process.env.GMAIL_APP_PASSWORD!,
    private target = process.env.GMAIL_TARGET_ADDRESS!,
    private allowedSenders = parseSenders(process.env.GMAIL_ALLOWED_SENDERS),
  ) {}

  async fetchNewMessages(lastUid: number): Promise<FetchResult> {
    const client = new ImapFlow({
      host: "imap.gmail.com", port: 993, secure: true,
      auth: { user: this.user, pass: this.pass }, logger: false,
    });
    await client.connect();
    const messages: RawMessage[] = [];
    let maxUid = lastUid;
    const lock = await client.getMailboxLock("INBOX");
    try {
      // UID range from lastUid+1 up, filtered by destination address.
      const range = `${lastUid + 1}:*`;
      for await (const msg of client.fetch(
        { uid: range },
        { uid: true, source: true, envelope: true },
        { uid: true },
      )) {
        if (!acceptsEnvelope(msg.envelope, this.target, this.allowedSenders)) continue;
        if (msg.uid <= lastUid) continue; // `n:*` always returns at least the last msg
        messages.push({ uid: msg.uid, raw: msg.source as Buffer });
        if (msg.uid > maxUid) maxUid = msg.uid;
      }
    } finally {
      lock.release();
      await client.logout();
    }
    messages.sort((a, b) => a.uid - b.uid);
    return { messages, maxUid };
  }
}
