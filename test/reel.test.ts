import { describe, it, expect } from "vitest";
import { isReelUrl, isAudioTrack } from "../src/lib/reel";
import { buildTranscribeRequest, transcribeAudio } from "../src/lib/transcribe";

describe("isReelUrl", () => {
  it("reconhece reels/reel/p/tv do Instagram", () => {
    expect(isReelUrl("https://www.instagram.com/reels/DayAG8HMQsu/")).toBe(true);
    expect(isReelUrl("https://instagram.com/reel/ABC123/")).toBe(true);
    expect(isReelUrl("https://www.instagram.com/p/ABC/")).toBe(true);
  });
  it("ignora perfis do Instagram e outros sites", () => {
    expect(isReelUrl("https://www.instagram.com/someuser/")).toBe(false);
    expect(isReelUrl("https://youtube.com/watch?v=x")).toBe(false);
    expect(isReelUrl("https://example.com/reel/x")).toBe(false);
    expect(isReelUrl("não é url")).toBe(false);
  });
});

// Monta um trecho de MP4 mínimo com um box hdlr de um dado handler_type.
function mp4Head(handler: "soun" | "vide"): Buffer {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from("hdlr", "latin1"),
    Buffer.alloc(8), // version/flags + pre_defined
    Buffer.from(handler, "latin1"),
    Buffer.alloc(12),
  ]);
}

describe("isAudioTrack", () => {
  it("detecta faixa de áudio (soun)", () => {
    expect(isAudioTrack(mp4Head("soun"))).toBe(true);
  });
  it("rejeita faixa de vídeo (vide)", () => {
    expect(isAudioTrack(mp4Head("vide"))).toBe(false);
  });
  it("rejeita buffer sem hdlr", () => {
    expect(isAudioTrack(Buffer.from("nada aqui"))).toBe(false);
  });
});

describe("buildTranscribeRequest", () => {
  it("inclui o áudio inline e a instrução", () => {
    const req = buildTranscribeRequest("QUJD", "audio/mp4") as any;
    const parts = req.contents[0].parts;
    expect(parts[0].inline_data).toEqual({ mime_type: "audio/mp4", data: "QUJD" });
    expect(parts[1].text).toMatch(/Transcreva/i);
    expect(req.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });
});

describe("transcribeAudio", () => {
  it("devolve a transcrição quando há fala", async () => {
    const r = await transcribeAudio(Buffer.from("x"), "audio/mp4", async () => "Olá, isto é um teste.");
    expect(r.hasSpeech).toBe(true);
    expect(r.transcript).toBe("Olá, isto é um teste.");
  });
  it("marca hasSpeech=false quando o modelo diz [sem fala]", async () => {
    const r = await transcribeAudio(Buffer.from("x"), "audio/mp4", async () => "[sem fala]");
    expect(r.hasSpeech).toBe(false);
    expect(r.transcript).toBe("");
  });
});
