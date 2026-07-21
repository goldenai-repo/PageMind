import { cookies } from "next/headers";
import type { DecodedIdToken } from "firebase-admin/auth";

import { SESSION_COOKIE_NAME } from "./config";
import { getAdminAuth } from "./admin";

export async function getCurrentUser(): Promise<DecodedIdToken | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!session) return null;

  try {
    return await getAdminAuth().verifySessionCookie(session, true);
  } catch {
    return null;
  }
}
