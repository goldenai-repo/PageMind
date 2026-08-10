import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/firebase/auth-server";
import { listUserBookEntries } from "@/lib/library-server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const entries = await listUserBookEntries(user.uid);
  return NextResponse.json({ entries });
}
