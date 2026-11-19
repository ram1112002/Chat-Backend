import { DocumentSnapshot, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { badRequest, forbidden, notFound } from '../errors';
import { firestore, lastSeenCol, messagesCol, receiptsCol } from '../firebase';
import { LastSeenDoc, MessageDoc, MessageDto } from '../types';
import { assertMember } from './chatService';

function toDto(chatId: string, snap: DocumentSnapshot): MessageDto {
  const data = snap.data() as MessageDoc | undefined;
  if (!data) throw notFound('Message not found');
  return {
    id: snap.id,
    chatId,
    senderId: data.senderId,
    text: data.deleted ? '' : data.text,
    createdAt: data.createdAt.toDate().toISOString(),
    editedAt: data.editedAt ? data.editedAt.toDate().toISOString() : null,
    deleted: data.deleted,
    readBy: data.readBy,
  };
}

export async function sendMessage(
  chatId: string,
  senderId: string,
  text: string,
): Promise<MessageDto> {
  await assertMember(chatId, senderId);

  const ref = messagesCol(chatId).doc();
  const doc: Omit<MessageDoc, 'createdAt'> & { createdAt: FieldValue } = {
    senderId,
    text,
    createdAt: FieldValue.serverTimestamp(),
    deleted: false,
    readBy: [],
  };
  await ref.set(doc);

  // Read back so the response carries the server-assigned timestamp.
  return toDto(chatId, await ref.get());
}

export async function getMessages(
  chatId: string,
  requesterId: string,
  limit: number,
): Promise<MessageDto[]> {
  await assertMember(chatId, requesterId);

  // Take the newest `limit` messages, then flip to oldest-first for display.
  const snap = await messagesCol(chatId).orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.reverse().map((d) => toDto(chatId, d));
}

export async function markRead(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<{ messageId: string; userId: string; readAt: string }> {
  await assertMember(chatId, userId);

  const msgRef = messagesCol(chatId).doc(messageId);
  const receiptRef = receiptsCol(chatId, messageId).doc(userId);

  await firestore.runTransaction(async (tx) => {
    const msgSnap = await tx.get(msgRef);
    if (!msgSnap.exists) throw notFound('Message not found');
    const msg = msgSnap.data() as MessageDoc;
    if (msg.senderId === userId) throw badRequest('Cannot mark your own message as read');

    const receiptSnap = await tx.get(receiptRef);
    if (receiptSnap.exists) return; // idempotent

    tx.set(receiptRef, { userId, readAt: FieldValue.serverTimestamp() });
    // Denormalized list so message fetches do not need one read per receipt.
    tx.update(msgRef, { readBy: FieldValue.arrayUnion(userId) });
  });

  const receipt = await receiptRef.get();
  const readAt = (receipt.get('readAt') as Timestamp).toDate().toISOString();
  return { messageId, userId, readAt };
}

export async function updateLastSeen(
  chatId: string,
  userId: string,
  messageId: string,
): Promise<{ userId: string; messageId: string }> {
  await assertMember(chatId, userId);

  const newMsgRef = messagesCol(chatId).doc(messageId);
  const lastSeenRef = lastSeenCol(chatId).doc(userId);

  return firestore.runTransaction(async (tx) => {
    const newMsg = await tx.get(newMsgRef);
    if (!newMsg.exists) throw notFound('Message not found');
    const lastSeen = await tx.get(lastSeenRef);

    // Keep the pointer monotonic: never move last seen backwards.
    if (lastSeen.exists) {
      const current = lastSeen.data() as LastSeenDoc;
      const currentMsg = await tx.get(messagesCol(chatId).doc(current.messageId));
      if (currentMsg.exists) {
        const currentAt = (currentMsg.data() as MessageDoc).createdAt;
        const newAt = (newMsg.data() as MessageDoc).createdAt;
        if (currentAt.toMillis() > newAt.toMillis()) {
          return { userId, messageId: current.messageId };
        }
      }
    }

    tx.set(lastSeenRef, { messageId, updatedAt: FieldValue.serverTimestamp() });
    return { userId, messageId };
  });
}

// Bonus: edit and soft delete. Only the sender may do either.

export async function editMessage(
  chatId: string,
  messageId: string,
  userId: string,
  text: string,
): Promise<MessageDto> {
  await assertMember(chatId, userId);
  const ref = messagesCol(chatId).doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('Message not found');
  const msg = snap.data() as MessageDoc;
  if (msg.senderId !== userId) throw forbidden('Only the sender can edit this message');
  if (msg.deleted) throw badRequest('Cannot edit a deleted message');

  await ref.update({ text, editedAt: FieldValue.serverTimestamp() });
  return toDto(chatId, await ref.get());
}

export async function deleteMessage(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<MessageDto> {
  await assertMember(chatId, userId);
  const ref = messagesCol(chatId).doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('Message not found');
  const msg = snap.data() as MessageDoc;
  if (msg.senderId !== userId) throw forbidden('Only the sender can delete this message');

  await ref.update({ deleted: true, text: '', editedAt: FieldValue.serverTimestamp() });
  return toDto(chatId, await ref.get());
}
