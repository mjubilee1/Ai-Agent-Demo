import Anthropic from "@anthropic-ai/sdk";
import 'dotenv/config';
import { Hono } from 'hono';
import { ingestChat } from "./ingest";
import { retrieve } from './utils';

type ProposedAction = {
    id: string;
    title: string;
    desc?: string;
    status: "proposed" | "approved" | "rejected";
    tool?: string;
    payload?: any;
};

const app = new Hono();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// in-memory store: sessionId -> (proposalId -> ProposedAction)
const actionsBySession = new Map<string, Map<string, ProposedAction>>();

app.get('/', (c) => c.text('🤖 AI Agent backend running!'));

app.post('/chat', async (c) => {
    const body =
      (await c.req.json<{ sessionId: string; message: string }>().catch(() => null)) ||
      { sessionId: '', message: '' };
  
    const { sessionId, message } = body;
    if (!message?.trim()) {
      return c.json(
        { reply: { text: 'Please provide a message.', proposedActions: [], chunks: [] } },
        400
      );
    }
  
    // 1) Retrieval
    const chunks = await retrieve(message, 6);
  
    // 2) Ask Claude to propose actions (JSON-only)
    const contextBlock = chunks
      .slice(0, 6)
      .map((c, i) => `#${i + 1} [${c.source}] ${c.snippet}`)
      .join('\n---\n');
  
    const sys = `
  You are an AI planning agent. Use the retrieved evidence to respond briefly
  and propose zero or more actions the user might want. Return STRICT JSON:
  {
    "text": string,               // one-paragraph reply
    "actions": [                  // optional
      { "title": string, "desc": string }
    ]
  }
  Do not include any other keys.`;
  
    const userContent = `User message:\n${message}\n\nRetrieved evidence:\n${contextBlock}`;
  
    const msg = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 600,
      system: sys,
      messages: [{ role: 'user', content: userContent }],
    });
  
    // 3) Parse Claude JSON safely
    let text = `You said: "${message}".`;
    let proposedActions: Array<{ title: string; desc?: string }> = [];
  
    try {
      const raw = msg.content
        .map((p) => ('text' in p ? p.text : ''))
        .join('')
        .trim();
  
      // Attempt to extract JSON (in case Claude wraps it)
      const jsonStrMatch = raw.match(/\{[\s\S]*\}$/);
      const parsed = JSON.parse(jsonStrMatch ? jsonStrMatch[0] : raw);
  
      if (parsed?.text) text = parsed.text;
      if (Array.isArray(parsed?.actions))
        proposedActions = parsed.actions.map((a: any) => ({
          title: String(a.title || 'Proposed action'),
          desc: a.desc ? String(a.desc) : undefined,
        }));
    } catch {
      // Fallback if parsing fails
      text = `You said: "${message}". (Note: plan JSON parse failed; showing fallback.)`;
    }
  
    const store = actionsBySession.get(sessionId) ?? new Map<string, ProposedAction>();
    const withIds: ProposedAction[] = proposedActions.map((a) => {
        const id = crypto.randomUUID();
        const rec: ProposedAction = { id, title: a.title, desc: a.desc, status: "proposed" };
        store.set(id, rec);
        return rec;
    });
    actionsBySession.set(sessionId, store);

    await ingestChat(sessionId, [
        { role: "user", text: message, ts: Date.now() },
        { role: "assistant", text: text, ts: Date.now() + 1 },
      ]);
      
    return c.json({
      reply: {
        text,
        proposedActions: withIds,
        chunks: chunks.map((c) => ({ source: c.source, snippet: c.snippet })),
      },
    });
  });

app.post("/approve", async (c) => {
    const { sessionId, proposalId, approve } =
      (await c.req.json().catch(() => ({}))) as { sessionId?: string; proposalId?: string; approve?: boolean };
  
    if (!sessionId || !proposalId || typeof approve !== "boolean") {
      return c.json({ error: "Missing sessionId/proposalId/approve" }, 400);
    }
  
    const store = actionsBySession.get(sessionId);
    if (!store) return c.json({ error: "No actions for session" }, 404);
  
    const action = store.get(proposalId);
    if (!action) return c.json({ error: "Proposal not found" }, 404);
  
    action.status = approve ? "approved" : "rejected";
    store.set(proposalId, action);
  
    // TODO: if approved, actually execute the tool (Trello/Calendar/etc.)
    if (approve) console.log("✅ Executing action:", action);
  
    return c.json({ action });
  });
  
  app.get("/actions", (c) => {
    const sessionId = c.req.query("sessionId");
    const store = sessionId ? actionsBySession.get(sessionId) : undefined;
    const actions = store ? Array.from(store.values()) : [];
    return c.json({ actions });
  });
  
export default app;
