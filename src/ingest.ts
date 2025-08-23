import { Pinecone } from "@pinecone-database/pinecone";
import crypto from "node:crypto";
import { embedTexts } from "./utils";

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.Index(process.env.PINECONE_INDEX!);

type ChatMsg = { role: "user" | "assistant"; text: string; ts?: number };

export async function ingestChat(sessionId: string, msgs: ChatMsg[]) {
  // dedupe id by hashing (sessionId + role + text)
  const ids = msgs.map(m =>
    crypto.createHash("sha1").update(`${sessionId}:${m.role}:${m.text}`).digest("hex")
  );

  const vectors = await embedTexts(msgs.map(m => m.text));
  const now = Date.now();

  await index.upsert(
    vectors.map((v, i) => ({
      id: ids[i],
      values: v,
      metadata: {
        kind: "chat",
        sessionId,
        role: msgs[i].role,
        ts: msgs[i].ts ?? now,
        source: `chat://${sessionId}#${msgs[i].role}/${msgs[i].ts ?? now}`,
        preview: msgs[i].text.slice(0, 240),
      },
    }))
  );
}
