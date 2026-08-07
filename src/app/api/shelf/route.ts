import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/firebase/auth-server";
import { shelfCollection, shelfEntryFromDoc } from "@/lib/library-server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const snapshot = await shelfCollection(user.uid).get();
  const entries = snapshot.docs.map(shelfEntryFromDoc);
  return NextResponse.json({ entries });
}
