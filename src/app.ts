import express from 'express';
import { errorHandler } from './middleware/errorHandler';
import { chatRouter } from './routes/chat';
import { userRouter } from './routes/user';

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/chat', chatRouter);
  app.use('/user', userRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
  app.use(errorHandler);
  return app;
}
