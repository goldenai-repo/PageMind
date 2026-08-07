import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/firebase/auth-server";
import { tipsCollection, type TipDoc } from "@/lib/library-server";
import type { TipCard, TipType } from "@/lib/tips";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { bookId } = await params;
  const snap = await tipsCollection(bookId).orderBy("order").get();

  const tips: TipCard[] = snap.docs.map((doc) => {
    const d = doc.data() as TipDoc;
    return {
      id: doc.id,
      type: d.type as TipType,
      title: d.title,
      body: d.body,
      anchor: {
        text: d.anchorText,
        chapterHref: d.chapterHref,
        pageNumber: d.pageNumber,
      },
      references: d.references ?? [],
    };
  });

  return NextResponse.json({ tips });
}
