import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { createOrGetDirectChat } from '../services/chatService';
import {
  deleteMessage,
  editMessage,
  getMessages,
  markRead,
  sendMessage,
  updateLastSeen,
} from '../services/messageService';

const id = z.string().uuid();
const messageId = z.string().min(1).max(128);
const text = z.string().trim().min(1).max(4000);

export const chatRouter = Router();

// 1. Create or get chat
chatRouter.post(
  '/create',
  asyncHandler(async (req, res) => {
    const { userAId, userBId } = z.object({ userAId: id, userBId: id }).parse(req.body);
    const { chatId, created } = await createOrGetDirectChat(userAId, userBId);
    res.status(created ? 201 : 200).json({ chatId });
  }),
);

// 2. Send message
chatRouter.post(
  '/:chatId/message/send',
  asyncHandler(async (req, res) => {
    const { chatId } = z.object({ chatId: id }).parse(req.params);
    const body = z.object({ senderId: id, text }).parse(req.body);
    const message = await sendMessage(chatId, body.senderId, body.text);
    res.status(201).json(message);
  }),
);

// 3. Get messages (userId identifies who is reading, for the membership check)
chatRouter.get(
  '/:chatId/messages',
  asyncHandler(async (req, res) => {
    const { chatId } = z.object({ chatId: id }).parse(req.params);
    const q = z
      .object({
        userId: id,
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);
    const messages = await getMessages(chatId, q.userId, q.limit);
    res.json({ messages });
  }),
);

// 4. Mark message read
chatRouter.post(
  '/:chatId/message/:messageId/read',
  asyncHandler(async (req, res) => {
    const params = z.object({ chatId: id, messageId }).parse(req.params);
    const { userId } = z.object({ userId: id }).parse(req.body);
    res.json(await markRead(params.chatId, params.messageId, userId));
  }),
);

// 5. Update last seen message
chatRouter.post(
  '/:chatId/lastseen',
  asyncHandler(async (req, res) => {
    const { chatId } = z.object({ chatId: id }).parse(req.params);
    const body = z.object({ userId: id, messageId }).parse(req.body);
    res.json(await updateLastSeen(chatId, body.userId, body.messageId));
  }),
);

// Bonus: edit and delete
chatRouter.patch(
  '/:chatId/message/:messageId',
  asyncHandler(async (req, res) => {
    const params = z.object({ chatId: id, messageId }).parse(req.params);
    const body = z.object({ userId: id, text }).parse(req.body);
    res.json(await editMessage(params.chatId, params.messageId, body.userId, body.text));
  }),
);

chatRouter.delete(
  '/:chatId/message/:messageId',
  asyncHandler(async (req, res) => {
    const params = z.object({ chatId: id, messageId }).parse(req.params);
    const body = z.object({ userId: id }).parse(req.body);
    res.json(await deleteMessage(params.chatId, params.messageId, body.userId));
  }),
);
