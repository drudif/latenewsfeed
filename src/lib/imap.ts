import { ImapFlow } from "imapflow";

// trackUid=false (ex.: Spam) → a mensagem é processada mas NÃO avança o lastUid
// do INBOX; é re-escaneada a cada ciclo e o dedup por Message-ID evita repetir.
export type RawMessage = { uid: number; raw: Buffer; trackUid?: boolean };
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
    try {
      // INBOX — rastreado por UID (lastUid+1:*), filtrado por destino/remetente.
      const lock = await client.getMailboxLock("INBOX");
      try {
        for await (const msg of client.fetch(
          { uid: `${lastUid + 1}:*` },
          { uid: true, source: true, envelope: true },
          { uid: true },
        )) {
          if (!acceptsEnvelope(msg.envelope, this.target, this.allowedSenders)) continue;
          if (msg.uid <= lastUid) continue; // `n:*` always returns at least the last msg
          messages.push({ uid: msg.uid, raw: msg.source as Buffer, trackUid: true });
          if (msg.uid > maxUid) maxUid = msg.uid;
        }
      } finally {
        lock.release();
      }

      // SPAM — forwards às vezes caem no spam. Re-escaneia as últimas ~25 e deixa
      // o dedup por Message-ID cuidar das repetições (não rastreado por UID).
      for (const spamFolder of ["[Gmail]/Spam", "[Google Mail]/Spam", "Spam", "Junk"]) {
        try {
          const st = await client.status(spamFolder, { messages: true });
          if (!st.messages) { break; }
          const lock2 = await client.getMailboxLock(spamFolder);
          try {
            const start = Math.max(1, (st.messages ?? 0) - 24);
            for await (const msg of client.fetch(
              `${start}:*`,
              { uid: true, source: true, envelope: true },
            )) {
              if (!acceptsEnvelope(msg.envelope, this.target, this.allowedSenders)) continue;
              messages.push({ uid: msg.uid, raw: msg.source as Buffer, trackUid: false });
            }
          } finally {
            lock2.release();
          }
          break; // achou a pasta de spam
        } catch {
          /* pasta não existe nesse idioma — tenta a próxima */
        }
      }
    } finally {
      await client.logout();
    }
    // INBOX (rastreado) primeiro, em ordem de UID; spam depois.
    messages.sort((a, b) => {
      const at = a.trackUid !== false, bt = b.trackUid !== false;
      return at === bt ? a.uid - b.uid : at ? -1 : 1;
    });
    return { messages, maxUid };
  }
}
