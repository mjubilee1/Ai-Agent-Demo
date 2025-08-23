import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => c.text('🤖 AI Agent backend running!'));

app.post('/chat', async (c) => {
  const body = await c.req.json<{ sessionId: string; message: string }>().catch(() => ({ sessionId: 'demo', message: '' }));
  const { message } = body;

  // TODO: call Anthropic + Pinecone here
  const reply = {
    text: `You said: "${message}". Backend is wired; LLM & Pinecone coming next.`,
    proposedActions: [
      { title: "Create Trello card: Draft proposal", desc: "Auto-created from user request" },
      { title: "Add calendar event: Kickoff", desc: "Friday 2pm, 30 minutes" },
    ],
    chunks: [
      { source: "docs/architecture.md", snippet: "LangGraph plans → tools → approvals → execution." },
      { source: "docs/ingest.md", snippet: "Chunk size ~800, overlap 10–15%, metadata filters." },
    ],
  };

  return c.json({ reply });
});

export default app;
