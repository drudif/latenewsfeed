import { simpleParser } from "mailparser";

export type ImagePart = {
  buffer: Buffer;
  contentType: string;
  filename: string | null;
};

export type NormalizedInput = {
  source: "email" | "paste";
  sender: string | null;
  subject: string | null;
  text: string;
  html: string | null;
  messageId: string | null;
  images: ImagePart[];
};

export async function parseEmail(raw: Buffer): Promise<NormalizedInput> {
  const mail = await simpleParser(raw);
  const images: ImagePart[] = (mail.attachments ?? [])
    .filter((a) => (a.contentType ?? "").startsWith("image/"))
    .map((a) => ({
      buffer: a.content as Buffer,
      contentType: a.contentType,
      filename: a.filename ?? null,
    }));
  return {
    source: "email",
    sender: mail.from?.text ?? null,
    subject: mail.subject ?? null,
    text: (mail.text ?? "").trim(),
    html: typeof mail.html === "string" ? mail.html : null,
    messageId: mail.messageId ?? null,
    images,
  };
}
