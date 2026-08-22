"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { TIP_TYPES, type TipCard } from "@/lib/tips";
import { cn } from "@/lib/utils";

export function ReaderNotesSidebar({
  tips,
  visibleTips,
  loading,
  onSelectTip,
}: {
  tips: TipCard[];
  visibleTips: TipCard[];
  loading: boolean;
  onSelectTip?: (tip: TipCard) => void;
}) {
  const [scope, setScope] = useState<"page" | "all">("page");
  const shown = scope === "all" ? tips : visibleTips;
  const visibleIds = new Set(visibleTips.map((t) => t.id));

  // In-flow panel (not shadcn `Sidebar`): the app sidebar is `position:
  // fixed` to the viewport, which would cover the reader header (mode
  // switcher) and steal flex space from the page.
  return (
    <aside className="flex h-full w-(--sidebar-width) shrink-0 flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-navy text-white">
                <Lightbulb className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold text-navy">
                  Smart Notes
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {tips.length > 0 ? `${tips.length} in this book` : "Tips"}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {tips.length > 0 ? (
          <div className="mx-2 mb-1 flex rounded-md border border-sidebar-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setScope("page")}
              className={cn(
                "flex-1 rounded-[5px] px-2 py-1 text-[0.72rem] font-medium transition-colors",
                scope === "page"
                  ? "bg-navy text-white"
                  : "text-muted-foreground hover:text-navy",
              )}
            >
              This page
            </button>
            <button
              type="button"
              onClick={() => setScope("all")}
              className={cn(
                "flex-1 rounded-[5px] px-2 py-1 text-[0.72rem] font-medium transition-colors",
                scope === "all"
                  ? "bg-navy text-white"
                  : "text-muted-foreground hover:text-navy",
              )}
            >
              All notes
            </button>
          </div>
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {scope === "all" ? "In this book" : "On this page"}
          </SidebarGroupLabel>
          <SidebarGroupContent className="space-y-3 px-1">
            {loading ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                Loading…
              </p>
            ) : tips.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs leading-relaxed text-muted-foreground">
                No smart notes for this book yet.
              </p>
            ) : shown.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs leading-relaxed text-muted-foreground">
                No smart notes on this page. Open All notes, or keep reading —
                they appear beside the passages they annotate.
              </p>
            ) : null}
            {shown.map((tip) => {
              const meta = TIP_TYPES[tip.type];
              const onThisPage = visibleIds.has(tip.id);
              const clickable = Boolean(onSelectTip);
              return (
                <div
                  key={tip.id}
                  className={cn(
                    "rounded-lg border border-sidebar-border bg-background p-3 text-left shadow-[0_2px_10px_rgba(27,54,93,0.06)]",
                    clickable &&
                      "cursor-pointer transition-colors hover:border-navy/40 hover:bg-navy/5",
                  )}
                  style={{ borderLeft: `4px solid ${meta.color}` }}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onSelectTip?.(tip) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectTip?.(tip);
                          }
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[0.62rem] font-bold tracking-wider uppercase"
                      style={{ color: meta.color }}
                    >
                      {meta.icon} {meta.label}
                    </span>
                    {scope === "all" && onThisPage ? (
                      <span className="text-[0.62rem] font-medium text-navy">
                        On this page
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[0.9rem] leading-snug font-semibold text-foreground">
                    {tip.title}
                  </p>
                  <p className="mt-1 text-[0.82rem] leading-relaxed text-[#55617a]">
                    {tip.body}
                  </p>
                  {tip.anchor.text ? (
                    <p className="mt-2 border-l-2 border-border pl-2 text-[0.74rem] text-muted-foreground italic">
                      “{tip.anchor.text}”
                    </p>
                  ) : null}
                  {clickable ? (
                    <p className="mt-2 text-[0.68rem] text-muted-foreground">
                      Click to open this passage
                    </p>
                  ) : null}
                  {tip.references && tip.references.length > 0 ? (
                    <div className="mt-2 flex flex-col gap-1">
                      {tip.references.map((ref, i) => {
                        const internal = ref.url.startsWith("/");
                        return (
                          <a
                            key={i}
                            href={ref.url}
                            target={internal ? undefined : "_blank"}
                            rel={internal ? undefined : "noopener noreferrer"}
                            className="truncate text-[0.76rem] font-medium text-navy hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            📎 {ref.label}
                          </a>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </aside>
  );
}
