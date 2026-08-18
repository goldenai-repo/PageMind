"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";

import type { LibraryBook } from "@/lib/books";
import { coverFromTitle } from "@/lib/cover";
import { peekCover, rememberCover } from "@/lib/cover-cache";
import { loadCachedCover, saveCachedCover } from "@/lib/storage";
import { cn } from "@/lib/utils";

type CoverBook = Pick<LibraryBook, "id" | "title" | "ext" | "cover" | "coverImage">;

/**
 * Shared cover art for shelf cards and the Home detail overlay.
 * Object URLs are created/revoked in an effect so React Strict Mode
 * cannot reuse a revoked blob URL (which made covers randomly vanish).
 */
export function BookCover({
  book,
  className,
}: {
  book: CoverBook;
  className?: string;
}) {
  const [localBlob, setLocalBlob] = useState<Blob | null>(
    () => peekCover(book.id),
  );
  const imgRef = useRef<HTMLImageElement>(null);
  const blob = book.coverImage ?? localBlob;

  useEffect(() => {
    if (book.coverImage) rememberCover(book.id, book.coverImage);
  }, [book.id, book.coverImage]);

  useEffect(() => {
    if (book.coverImage || localBlob) return;
    const id = book.id;
    let cancelled = false;
    void (async () => {
      const cached =
        peekCover(id) ?? (await loadCachedCover(id).catch(() => null));
      if (cancelled) return;
      if (cached) {
        rememberCover(id, cached);
        setLocalBlob(cached);
        return;
      }
      if (book.ext !== "txt") return;
      const generated = await coverFromTitle(book.title, book.ext).catch(
        () => null,
      );
      if (cancelled || !generated) return;
      rememberCover(id, generated);
      void saveCachedCover(id, generated).catch(() => {});
      setLocalBlob(generated);
    })();
    return () => {
      cancelled = true;
    };
  }, [book.coverImage, book.ext, book.id, book.title, localBlob]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el || !blob) return;
    const url = URL.createObjectURL(blob);
    el.src = url;
    return () => {
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
    };
  }, [blob]);

  const waiting = !blob && (book.ext === "epub" || book.ext === "pdf");

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: book.cover }}
    >
      {blob ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URLs from canvas / file extract
        <img
          ref={imgRef}
          alt=""
          className="absolute inset-0 size-full object-cover"
          draggable={false}
        />
      ) : (
        <>
          <div className="absolute inset-y-0 left-0 w-[10px] border-r border-white/10 bg-black/20" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.14)_0%,transparent_55%)]" />
          {waiting ? (
            <div className="absolute inset-0 animate-pulse bg-white/10" />
          ) : (
            <BookOpen className="absolute top-1/2 left-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-white/40" />
          )}
        </>
      )}
    </div>
  );
}
