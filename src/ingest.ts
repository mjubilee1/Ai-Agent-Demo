// src/ingest.ts
import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';
import OpenAI from 'openai';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.Index(process.env.PINECONE_INDEX!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

async function ingest(id: string, text: string, source: string) {
  const chunks = [text];

  const embeddings = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: chunks,
  });

  await index.upsert(
    embeddings.data.map((e, i) => ({
      id: `${id}-${i}`,
      values: e.embedding,
      metadata: {
        text: chunks[i],
        source,
      },
    }))
  );

  console.log(`✅ Ingested ${chunks.length} chunk(s) from ${source}`);
}

ingest('doc1', 'Agent uses Pinecone for retrieval; chunk size ~800 tokens...', 'docs/intro.md');
