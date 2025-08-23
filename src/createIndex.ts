import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';

async function main() {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

  const name = process.env.PINECONE_INDEX || 'ai-agent-demo-1536';

  await pc.createIndex({
    name,
    dimension: 1536,             // <— matches OpenAI text-embedding-3-small
    metric: 'cosine',
    spec: {
      serverless: {
        cloud: 'aws',
        region: 'us-east-1',
      },
    },
  });

  console.log(`✅ Created index ${name} (1536-dim)`);
}
main().catch(console.error);
