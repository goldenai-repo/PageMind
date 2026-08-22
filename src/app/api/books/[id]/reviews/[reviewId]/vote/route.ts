import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/firebase/auth-server";
import {
  applyReviewVote,
  serializeReview,
} from "@/lib/library-server";
import type { ReviewVote } from "@/lib/reviews";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; reviewId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id, reviewId } = await params;
  if (reviewId === user.uid) {
    return NextResponse.json(
      { error: "You can’t vote on your own review." },
      { status: 400 },
    );
  }

  let body: { vote?: unknown };
  try {
    body = (await request.json()) as { vote?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const vote = body.vote;
  if (vote !== "up" && vote !== "down") {
    return NextResponse.json({ error: "Invalid vote." }, { status: 400 });
  }

  const updated = await applyReviewVote(
    id,
    reviewId,
    user.uid,
    vote as ReviewVote,
  );
  if (!updated) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }
  return NextResponse.json({
    review: serializeReview(reviewId, updated, user.uid),
  });
}
