import { NextResponse, type NextRequest } from "next/server";

import { getAdminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME } from "@/lib/firebase/config";

async function isValidSession(session: string | undefined): Promise<boolean> {
  if (!session) return false;
  try {
    await getAdminAuth().verifySessionCookie(session, true);
    return true;
  } catch {
    return false;
  }
}

function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function updateSession(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const path = request.nextUrl.pathname;
  const valid = await isValidSession(session);

  const isPublic =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/api/auth");

  // Stale/invalid cookie: clear it so it can't bounce login ↔ library
  if (session && !valid) {
    const response = isPublic
      ? NextResponse.next({ request })
      : NextResponse.redirect(new URL("/auth/login", request.url));
    clearSessionCookie(response);
    return response;
  }

  if (valid && (path.startsWith("/auth/login") || path.startsWith("/auth/sign-up"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/library";
    return NextResponse.redirect(url);
  }

  if (!valid && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}
