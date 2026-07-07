import { describe, it, expect, vi } from "vitest";
import { makeTestDb, seedCategories } from "./helpers/db";
import { runPoll } from "@/lib/poll";
import { FakeMailReader } from "@/lib/imap";
import { pollState, inputs } from "@/db/schema";
import { readFileSync } from "node:fs";
import path from "node:path";

const fx = (n: string) => readFileSync(path.resolve(__dirname, "fixtures", n));
const store = { upload: vi.fn(async () => "inputs/x.png"), publicUrl: (k: string) => k };
const classifier = async () => ({ categorySlug: "ler-depois", title: "T", summary: "S" });

async function initState(db: Awaited<ReturnType<typeof makeTestDb>>) {
  await db.insert(pollState).values({ id: 1, lastUid: 0 });
}

describe("runPoll", () => {
  it("ingests new messages and advances lastUid", async () => {
    const db = await makeTestDb(); await seedCategories(db); await initState(db);
    const reader = new FakeMailReader([
      { uid: 10, raw: fx("plain.eml") },
      { uid: 11, raw: fx("with-image.eml") },
    ]);
    const res = await runPoll({ db, store, classifier, reader });
    expect(res.ingested).toBe(2);
    expect((await db.select().from(inputs)).length).toBe(2);
    const state = await db.select().from(pollState);
    expect(state[0].lastUid).toBe(11);
  });

  it("does not advance past a message that fails to ingest", async () => {
    const db = await makeTestDb(); await seedCategories(db); await initState(db);
    const reader = new FakeMailReader([
      { uid: 10, raw: fx("plain.eml") },
      { uid: 11, raw: fx("with-image.eml") },
    ]);
    // Deterministic failure: classifier throws on the SECOND message only.
    let n = 0;
    const flaky = async () => {
      n += 1;
      if (n === 2) throw new Error("classify failed");
      return { categorySlug: "ler-depois", title: "T", summary: "S" };
    };
    const res = await runPoll({ db, store, classifier: flaky, reader });
    // uid 10 ingests; uid 11 throws inside ingest -> runPoll breaks without advancing.
    expect(res.ingested).toBe(1);
    const state = await db.select().from(pollState);
    expect(state[0].lastUid).toBe(10);
  });

  it("skips a poison (empty) message and advances past it", async () => {
    const db = await makeTestDb(); await seedCategories(db); await initState(db);
    const reader = new FakeMailReader([
      { uid: 20, raw: fx("empty.eml") },
      { uid: 21, raw: fx("plain.eml") },
    ]);
    const res = await runPoll({ db, store, classifier, reader });
    expect(res.ingested).toBe(1); // only plain.eml ingests
    const state = await db.select().from(pollState);
    expect(state[0].lastUid).toBe(21); // advanced PAST the poison message
  });
});
