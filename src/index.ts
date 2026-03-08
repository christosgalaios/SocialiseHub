/**
 * SocialiseHub — AI-powered business operations tool
 *
 * Core capabilities:
 * 1. Event Analysis & Learning — analyse past events to identify patterns
 * 2. Event Creation — multi-platform publishing (Meetup, Eventbrite, Headfirst, etc.)
 * 3. Social Media Management — (future) automated posting and scheduling
 */

import { createApp, VERSION } from './app.js';

export { VERSION };
export const PORT = Number(process.env.PORT) || 3000;

export function main() {
  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`SocialiseHub v${VERSION} listening on http://localhost:${PORT}`);
  });
  return server;
}

/* v8 ignore next 3 */
const isDirectRun = import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`;
if (isDirectRun) {
  main();
}
