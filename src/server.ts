import { serve } from '@hono/node-server';
import app from './index';

const port = Number(process.env.PORT ?? 4000);

serve({
  fetch: app.fetch,
  port,
  hostname: '0.0.0.0',   // ← important for Render/containers
});

const host = process.env.RENDER_EXTERNAL_HOSTNAME
  ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
  : `http://localhost:${port}`;

console.log(`🚀 Backend listening at ${host}`);
