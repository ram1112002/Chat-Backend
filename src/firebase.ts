import { readFileSync } from 'fs';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { config } from './config';

function init(): Firestore {
  if (getApps().length === 0) {
    if (config.usingEmulator) {
      initializeApp({ projectId: config.firebaseProjectId });
    } else if (config.firebaseServiceAccountPath) {
      const raw = readFileSync(config.firebaseServiceAccountPath, 'utf8');
      initializeApp({ credential: cert(JSON.parse(raw) as Record<string, string>) });
    } else {
      initializeApp({ credential: applicationDefault() });
    }
  }
  return getFirestore();
}

export const firestore: Firestore = init();

// Firestore layout:
//   chats/{chatId}/messages/{messageId}                 message document
//   chats/{chatId}/messages/{messageId}/readReceipts/{userId}   one receipt per reader
//   chats/{chatId}/lastSeen/{userId}                    last seen message per user
export const messagesCol = (chatId: string) =>
  firestore.collection('chats').doc(chatId).collection('messages');

export const receiptsCol = (chatId: string, messageId: string) =>
  messagesCol(chatId).doc(messageId).collection('readReceipts');

export const lastSeenCol = (chatId: string) =>
  firestore.collection('chats').doc(chatId).collection('lastSeen');
