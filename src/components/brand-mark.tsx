import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  showTag = true,
}: {
  className?: string;
  showTag?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5 select-none", className)}>
      <div className="flex size-11 items-center justify-center rounded-xl bg-card shadow-[0_2px_10px_rgba(27,54,93,0.14)]">
        <svg
          width="28"
          height="28"
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <rect x="3" y="2" width="16" height="22" rx="2" fill="#1B365D" />
          <rect
            x="7"
            y="5"
            width="8"
            height="1.5"
            rx="0.75"
            fill="#ffffff"
            opacity="0.7"
          />
          <rect
            x="7"
            y="9"
            width="10"
            height="1.5"
            rx="0.75"
            fill="#ffffff"
            opacity="0.7"
          />
          <rect
            x="7"
            y="13"
            width="6"
            height="1.5"
            rx="0.75"
            fill="#ffffff"
            opacity="0.7"
          />
          <circle cx="21" cy="21" r="6" fill="#2E86AB" />
          <path
            d="M18.5 21l2 2 3-3"
            stroke="#ffffff"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span className="text-[1.35rem] font-bold tracking-tight text-navy">
        PageMind
      </span>
      {showTag ? (
        <span className="rounded-full bg-border px-2.5 py-0.5 text-[0.72rem] font-medium tracking-wide text-muted-foreground">
          AI PDF Reader
        </span>
      ) : null}
    </div>
  );
}
