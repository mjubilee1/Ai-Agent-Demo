import Anthropic from "@anthropic-ai/sdk";
import 'dotenv/config';
import { Hono } from 'hono';
import { retrieve } from './utils';

const app = new Hono();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

app.get('/', (c) => c.text('🤖 AI Agent backend running!'));

app.post('/chat', async (c) => {
    const body =
      (await c.req.json<{ sessionId?: string; message: string }>().catch(() => null)) ||
      { sessionId: 'demo', message: '' };
  
    const { message } = body;
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
  
    return c.json({
      reply: {
        text,
        proposedActions,
        chunks: chunks.map((c) => ({ source: c.source, snippet: c.snippet })),
      },
    });
  });
  

export default app;
