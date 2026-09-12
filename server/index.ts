import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { Repository } from './db';
import { createAIService } from './ai';
import { createApp } from './app';

if (existsSync('.env')) process.loadEnvFile('.env');
const production = process.argv[1]?.endsWith('server.js') || process.env.NODE_ENV === 'production';
if (production) process.env.NODE_ENV = 'production';
const repository = new Repository(process.env.DATABASE_PATH || './data/teacher-awareness.db');
const app = createApp(repository, createAIService());
if (production) {
  app.use(express.static(resolve('dist/client'), { index: false }));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/client/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () => console.log(`Teacher Awareness Assistant running at http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { repository.close(); process.exit(0); }));
