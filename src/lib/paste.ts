import type { NormalizedInput, ImagePart } from "./email";

export function normalizePaste(text: string, images: ImagePart[]): NormalizedInput {
  return {
    source: "paste",
    sender: null,
    subject: null,
    text: text.trim(),
    html: null,
    messageId: null,
    images,
  };
}
