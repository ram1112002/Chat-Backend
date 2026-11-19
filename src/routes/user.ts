import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { createUser, listUserChats } from '../services/chatService';

export const userRouter = Router();

// Helper endpoint so the API can be exercised end to end (not part of the required list).
userRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(req.body);
    const user = await createUser(name);
    res.status(201).json({ id: user.id, name: user.name });
  }),
);

// 6. List user chats
userRouter.get(
  '/:userId/chats',
  asyncHandler(async (req, res) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    res.json({ chats: await listUserChats(userId) });
  }),
);
