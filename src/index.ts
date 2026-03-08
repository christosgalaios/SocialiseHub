/**
 * SocialiseHub — AI-powered business operations tool
 *
 * Core capabilities:
 * 1. Event Analysis & Learning — analyse past events to identify patterns
 * 2. Event Creation — multi-platform publishing (Meetup, Headfirst, etc.)
 * 3. Social Media Management — (future) automated posting and scheduling
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export const VERSION = '0.1.0';
export const PORT = Number(process.env.PORT) || 3000;

export function handleRequest(_req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ name: 'SocialiseHub', version: VERSION }));
}

export function main() {
  const server = createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`SocialiseHub v${VERSION} listening on http://localhost:${PORT}`);
  });
  return server;
}

const isDirectRun = import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`;
if (isDirectRun) {
  main();
}
