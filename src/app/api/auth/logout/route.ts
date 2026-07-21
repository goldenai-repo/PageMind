import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/firebase/config";

export async function POST() {
  const response = NextResponse.json({ status: "ok" });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return response;
}
