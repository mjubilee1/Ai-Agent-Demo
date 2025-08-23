import { serve } from '@hono/node-server';
import app from './index';

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

serve({
  fetch: app.fetch,
  port,
});

console.log(`🚀 Backend at http://localhost:${port}`);
