import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => c.text('🤖 AI Agent backend running!'));

export default app;
