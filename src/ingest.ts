import { Pinecone } from "@pinecone-database/pinecone";
import crypto from "node:crypto";
import { embedTexts } from "./utils";

// Initialize Pinecone client lazily to handle missing API keys gracefully
let pc: Pinecone | null = null;
let index: any = null;

function getPineconeIndex() {
  if (!pc && process.env.PINECONE_API_KEY) {
    try {
      pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
      index = pc.Index(process.env.PINECONE_INDEX || 'ai-agent-demo-1536');
    } catch (error) {
      console.warn('Pinecone initialization failed in ingest:', error);
    }
  }
  return { pc, index };
}

type ChatMsg = { role: "user" | "assistant"; text: string; ts?: number };

export async function ingestChat(sessionId: string, msgs: ChatMsg[]) {
  const { index } = getPineconeIndex();
  
  if (!index) {
    console.warn('Pinecone not available, skipping chat ingestion');
    return;
  }

  try {
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
  } catch (error) {
    console.warn('Chat ingestion failed:', error);
  }
}
