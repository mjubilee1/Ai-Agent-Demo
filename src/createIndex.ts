import { Pinecone } from "@pinecone-database/pinecone";
import 'dotenv/config';

async function main() {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

  const indexName = process.env.PINECONE_INDEX!;

  await pc.createIndexForModel({
    name: indexName,
    cloud: "aws",
    region: "us-east-1",
    embed: {
      model: "llama-text-embed-v2",
      fieldMap: { text: "chunk_text" },
    },
    waitUntilReady: true,
  });

  console.log(`✅ Index '${indexName}' created`);
}

main().catch(console.error);
