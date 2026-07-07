import { ImapFlow } from "imapflow";

export type RawMessage = { uid: number; raw: Buffer };
export type FetchResult = { messages: RawMessage[]; maxUid: number };

export interface MailReader {
  fetchNewMessages(lastUid: number): Promise<FetchResult>;
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
        const to = (msg.envelope?.to ?? []).map((a) => a.address?.toLowerCase() ?? "");
        if (!to.includes(this.target.toLowerCase())) continue;
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
