# Chat Backend

Node.js + TypeScript (strict) chat backend.

- **PostgreSQL**: users, chats, chat membership
- **Firebase Firestore**: messages, read receipts, last seen pointers

## Architecture

```
Postgres                         Firestore
users                            chats/{chatId}/messages/{messageId}
chats (direct_key UNIQUE)          chats/{chatId}/messages/{messageId}/readReceipts/{userId}
chat_members (chat_id, user_id)    chats/{chatId}/lastSeen/{userId}
```

Design notes:

- **One chat per pair.** A 1:1 chat gets `direct_key = "<smaller id>:<larger id>"` with a UNIQUE constraint, so
  `INSERT ... ON CONFLICT DO NOTHING` makes create-or-get race safe, and (A,B) equals (B,A).
- **Authorization.** Postgres is the source of truth for membership. Every message endpoint checks the caller
  is a member of the chat before touching Firestore (404 if no chat, 403 if not a member).
- **Ordering.** `createdAt` is a Firestore server timestamp. Reads fetch the newest `limit` messages and return
  them oldest first.
- **Read receipts.** One doc per (message, reader) in a subcollection. Written in a transaction, so repeated
  calls are idempotent. The reader id is also added to `readBy` on the message so listing messages needs no
  extra reads per message.
- **Last seen.** One doc per (chat, user). It only moves forward: sending an older message id will not rewind it.

## Setup

```bash
npm install
cp .env.example .env
docker compose up -d          # PostgreSQL
npm run migrate               # applies schema.sql
```

Firestore, pick one:

1. Real project: download a service account key from Firebase console (Project settings, Service accounts)
   and set `FIREBASE_SERVICE_ACCOUNT_PATH` in `.env`.
2. Emulator: `firebase emulators:start --only firestore`, then set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`
   in `.env`.

Run:

```bash
npm run dev      # development
npm run build && npm start
```

## API

All ids are UUIDs. There is no auth layer, so the caller identity is passed in the request, as the spec describes.

| Method | Path | Body / Query | Response |
|---|---|---|---|
| POST | `/user` (helper) | `{ name }` | `{ id, name }` |
| POST | `/chat/create` | `{ userAId, userBId }` | `{ chatId }` (201 new, 200 existing) |
| POST | `/chat/:chatId/message/send` | `{ senderId, text }` | message |
| GET | `/chat/:chatId/messages?userId=&limit=50` | | `{ messages: [...] }` oldest first |
| POST | `/chat/:chatId/message/:messageId/read` | `{ userId }` | `{ messageId, userId, readAt }` |
| POST | `/chat/:chatId/lastseen` | `{ userId, messageId }` | `{ userId, messageId }` |
| GET | `/user/:userId/chats` | | `{ chats: [{ id, type, createdAt, memberIds }] }` |
| PATCH | `/chat/:chatId/message/:messageId` (bonus) | `{ userId, text }` | message |
| DELETE | `/chat/:chatId/message/:messageId` (bonus) | `{ userId }` | message (soft deleted) |

`GET /messages` takes `userId` as a query param so membership can be verified.

## Example run

```bash
A=$(curl -s -X POST localhost:3000/user -H 'content-type: application/json' -d '{"name":"Alice"}' | jq -r .id)
B=$(curl -s -X POST localhost:3000/user -H 'content-type: application/json' -d '{"name":"Bob"}' | jq -r .id)

CHAT=$(curl -s -X POST localhost:3000/chat/create -H 'content-type: application/json' \
  -d "{\"userAId\":\"$A\",\"userBId\":\"$B\"}" | jq -r .chatId)

MSG=$(curl -s -X POST localhost:3000/chat/$CHAT/message/send -H 'content-type: application/json' \
  -d "{\"senderId\":\"$A\",\"text\":\"hello\"}" | jq -r .id)

curl -s -X POST localhost:3000/chat/$CHAT/message/$MSG/read -H 'content-type: application/json' -d "{\"userId\":\"$B\"}"
curl -s -X POST localhost:3000/chat/$CHAT/lastseen -H 'content-type: application/json' -d "{\"userId\":\"$B\",\"messageId\":\"$MSG\"}"
curl -s "localhost:3000/chat/$CHAT/messages?userId=$B&limit=50"
curl -s localhost:3000/user/$B/chats
```

## Not included

Group chat creation and management. The schema already supports it (`chats.type`, `chat_members`).
