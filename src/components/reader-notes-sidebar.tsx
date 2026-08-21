"use client";

import { Lightbulb } from "lucide-react";

import {
  Sidebar,
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

export function ReaderNotesSidebar({
  tips,
  visibleTips,
  loading,
}: {
  tips: TipCard[];
  visibleTips: TipCard[];
  loading: boolean;
}) {
  return (
    <Sidebar side="right" collapsible="offcanvas" className="z-20">
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
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>On this page</SidebarGroupLabel>
          <SidebarGroupContent className="space-y-3 px-1">
            {loading ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                Loading…
              </p>
            ) : tips.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs leading-relaxed text-muted-foreground">
                No smart notes for this book yet.
              </p>
            ) : visibleTips.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs leading-relaxed text-muted-foreground">
                No smart notes on this page. Keep reading — they appear beside
                the passages they annotate.
              </p>
            ) : null}
            {visibleTips.map((tip) => {
              const meta = TIP_TYPES[tip.type];
              return (
                <div
                  key={tip.id}
                  className="rounded-lg border border-sidebar-border bg-background p-3 shadow-[0_2px_10px_rgba(27,54,93,0.06)]"
                  style={{ borderLeft: `4px solid ${meta.color}` }}
                >
                  <span
                    className="text-[0.62rem] font-bold tracking-wider uppercase"
                    style={{ color: meta.color }}
                  >
                    {meta.icon} {meta.label}
                  </span>
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
                  {tip.references && tip.references.length > 0 ? (
                    <div className="mt-2 flex flex-col gap-1">
                      {tip.references.map((ref, i) => (
                        <a
                          key={i}
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-[0.76rem] font-medium text-navy hover:underline"
                        >
                          📎 {ref.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
