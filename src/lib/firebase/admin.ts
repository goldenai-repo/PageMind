import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";
import type { Bucket } from "@google-cloud/storage";

/** Normalize PEM from .env / Doppler (quotes, escaped newlines, whitespace). */
function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  // Doppler/UI sometimes stores the value wrapped in quotes
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  // Turn literal \n into real newlines (common in single-line env values)
  key = key.replace(/\\n/g, "\n").trim();
  return key;
}

/** Bucket id without `gs://` — matches NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET. */
export function getStorageBucketName(): string {
  const raw =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    "";
  const name = raw.replace(/^gs:\/\//, "");
  if (!name) {
    throw new Error(
      "Missing storage bucket. Set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.",
    );
  }
  return name;
}

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ? normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY)
    : undefined;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.",
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: getStorageBucketName(),
  });
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminStorage(): Storage {
  return getStorage(getAdminApp());
}

export function getAdminBucket(): Bucket {
  return getAdminStorage().bucket(getStorageBucketName());
}
