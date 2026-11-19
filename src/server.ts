import { createApp } from './app';
import { config } from './config';
import { pool } from './db';

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`Chat backend listening on port ${config.port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
