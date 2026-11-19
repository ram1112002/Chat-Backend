import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-chat',
  usingEmulator: Boolean(process.env.FIRESTORE_EMULATOR_HOST),
} as const;
