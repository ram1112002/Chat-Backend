import { Timestamp } from 'firebase-admin/firestore';

export interface UserRow {
  id: string;
  name: string;
  created_at: Date;
}

export interface ChatSummary {
  id: string;
  type: 'direct' | 'group';
  createdAt: string;
  memberIds: string[];
}

export interface MessageDoc {
  senderId: string;
  text: string;
  createdAt: Timestamp;
  editedAt?: Timestamp;
  deleted: boolean;
  readBy: string[];
}

export interface MessageDto {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  readBy: string[];
}

export interface LastSeenDoc {
  messageId: string;
  updatedAt: Timestamp;
}
