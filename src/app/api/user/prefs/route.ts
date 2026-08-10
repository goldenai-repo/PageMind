import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/firebase/auth-server";
import {
  getUserPrefs,
  isReaderMode,
  setUserPrefs,
  type UserPrefs,
} from "@/lib/library-server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const prefs = await getUserPrefs(user.uid);
  return NextResponse.json({ prefs });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: Partial<UserPrefs>;
  try {
    body = (await request.json()) as Partial<UserPrefs>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: Partial<UserPrefs> = {};
  if (body.readerMode !== undefined) {
    if (!isReaderMode(body.readerMode)) {
      return NextResponse.json(
        { error: "Invalid readerMode. Use flip, scroll, or spread." },
        { status: 400 },
      );
    }
    patch.readerMode = body.readerMode;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const prefs = await setUserPrefs(user.uid, patch);
  return NextResponse.json({ prefs });
}
