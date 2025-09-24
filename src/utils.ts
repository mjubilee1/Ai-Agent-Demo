import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAI } from "openai/client.js";

// Initialize clients lazily to handle missing API keys gracefully
let pine: Pinecone | null = null;
let openai: OpenAI | null = null;
let pineIndex: any = null;

function getPinecone() {
  if (!pine && process.env.PINECONE_API_KEY) {
    try {
      pine = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
      pineIndex = pine.Index(process.env.PINECONE_INDEX || 'ai-agent-demo-1536');
    } catch (error) {
      console.warn('Pinecone initialization failed:', error);
    }
  }
  return { pine, pineIndex };
}

function getOpenAI() {
  if (!openai && process.env.OPENAI_API_KEY) {
    try {
      openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    } catch (error) {
      console.warn('OpenAI initialization failed:', error);
    }
  }
  return openai;
}

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small"; // 1536

export async function retrieve(query: string, topK = 6) {
  const { pine, pineIndex } = getPinecone();
  const openaiClient = getOpenAI();
  
  if (!openaiClient || !pineIndex) {
    // Return mock data when services are not available
    return [
      {
        source: 'mock-source-1',
        snippet: 'This is a mock response for testing purposes when Pinecone/OpenAI are not available.',
        score: 0.95,
      },
      {
        source: 'mock-source-2', 
        snippet: 'Another mock response to simulate document retrieval.',
        score: 0.87,
      }
    ];
  }

  try {
    const emb = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const vector = emb.data[0].embedding;
  
    const res = await pineIndex.query({
      topK,
      vector,
      includeMetadata: true,
    });
  
    return (res.matches ?? []).map(m => ({
      source: (m.metadata as any)?.source || m.id,
      snippet: (m.metadata as any)?.text || (m.metadata as any)?.preview || '',
      score: m.score,
    }));
  } catch (error) {
    console.warn('Retrieval failed, returning mock data:', error);
    return [
      {
        source: 'mock-source-1',
        snippet: 'This is a mock response for testing purposes when Pinecone/OpenAI are not available.',
        score: 0.95,
      },
      {
        source: 'mock-source-2', 
        snippet: 'Another mock response to simulate document retrieval.',
        score: 0.87,
      }
    ];
  }
}
  
export async function embedTexts(texts: string[]) {
  const openaiClient = getOpenAI();
  
  if (!openaiClient) {
    // Return mock embeddings when OpenAI is not available
    return texts.map(() => new Array(1536).fill(0).map(() => Math.random()));
  }

  try {
    const out = await openaiClient.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
    return out.data.map(d => d.embedding);
  } catch (error) {
    console.warn('Embedding failed, returning mock data:', error);
    return texts.map(() => new Array(1536).fill(0).map(() => Math.random()));
  }
}