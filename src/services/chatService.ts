import { query, withTransaction } from '../db';
import { badRequest, forbidden, notFound } from '../errors';
import { ChatSummary, UserRow } from '../types';

export async function createUser(name: string): Promise<UserRow> {
  const rows = await query<UserRow>('INSERT INTO users (name) VALUES ($1) RETURNING *', [name]);
  const row = rows[0];
  if (!row) throw new Error('Failed to create user');
  return row;
}

async function assertUsersExist(userIds: string[]): Promise<void> {
  const unique = [...new Set(userIds)];
  const rows = await query<{ id: string }>('SELECT id FROM users WHERE id = ANY($1::uuid[])', [
    unique,
  ]);
  if (rows.length !== unique.length) {
    throw notFound('One or more users do not exist');
  }
}

/** Returns the existing 1:1 chat for the pair, or creates it. Safe under concurrent calls. */
export async function createOrGetDirectChat(
  userAId: string,
  userBId: string,
): Promise<{ chatId: string; created: boolean }> {
  if (userAId === userBId) {
    throw badRequest('userAId and userBId must be different');
  }
  await assertUsersExist([userAId, userBId]);

  const directKey = [userAId, userBId].sort().join(':');

  return withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO chats (type, direct_key) VALUES ('direct', $1)
       ON CONFLICT (direct_key) DO NOTHING
       RETURNING id`,
      [directKey],
    );
    const newChat = inserted.rows[0];
    if (newChat) {
      await client.query(
        'INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2), ($1, $3)',
        [newChat.id, userAId, userBId],
      );
      return { chatId: newChat.id, created: true };
    }
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM chats WHERE direct_key = $1',
      [directKey],
    );
    const row = existing.rows[0];
    if (!row) throw new Error('Chat lookup failed after conflict');
    return { chatId: row.id, created: false };
  });
}

/** Throws 404 if the chat does not exist, 403 if the user is not a member. */
export async function assertMember(chatId: string, userId: string): Promise<void> {
  const rows = await query<{ chat_exists: boolean; is_member: boolean }>(
    `SELECT
       EXISTS (SELECT 1 FROM chats WHERE id = $1) AS chat_exists,
       EXISTS (SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2) AS is_member`,
    [chatId, userId],
  );
  const row = rows[0];
  if (!row?.chat_exists) throw notFound('Chat not found');
  if (!row.is_member) throw forbidden('User is not a member of this chat');
}

export async function listUserChats(userId: string): Promise<ChatSummary[]> {
  const users = await query<{ id: string }>('SELECT id FROM users WHERE id = $1', [userId]);
  if (users.length === 0) throw notFound('User not found');

  const rows = await query<{
    id: string;
    type: 'direct' | 'group';
    created_at: Date;
    member_ids: string[];
  }>(
    `SELECT c.id, c.type, c.created_at,
            array_agg(m.user_id ORDER BY m.user_id) AS member_ids
     FROM chats c
     JOIN chat_members me ON me.chat_id = c.id AND me.user_id = $1
     JOIN chat_members m  ON m.chat_id = c.id
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [userId],
  );

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    createdAt: r.created_at.toISOString(),
    memberIds: r.member_ids,
  }));
}
