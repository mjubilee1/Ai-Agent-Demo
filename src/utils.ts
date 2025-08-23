import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAI } from "openai/client.js";

const pine = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const pineIndex = pine.Index(process.env.PINECONE_INDEX!);

export async function retrieve(query: string, topK = 6) {
    const emb = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: query,
    });
    const vector = emb.data[0].embedding;
  
    const res = await pineIndex.query({
      topK,
      vector,
      includeMetadata: true,
    });
  
    return (res.matches || [])
      .map((m) => ({
        score: m.score ?? 0,
        source: (m.metadata as any)?.source ?? (m.id || 'unknown'),
        snippet:
          ((m.metadata as any)?.text as string) ||
          ((m.metadata as any)?.chunk_text as string) ||
          '',
      }))
      .filter((c) => c.snippet);
  }
  