"use client";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { ReaderTocItem } from "@/lib/readers/types";

export function ReaderTocNav({
  items,
  activeId,
  onSelect,
}: {
  items: ReaderTocItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Content</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.length === 0 ? (
            <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground group-data-[collapsible=icon]:hidden">
              No chapters in this file.
            </p>
          ) : (
            items.map((item) => (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  tooltip={item.label}
                  isActive={activeId === item.id}
                  data-toc-id={item.id}
                  title={item.label}
                  onClick={() => onSelect(item.id)}
                  style={
                    item.level
                      ? { paddingLeft: `${0.5 + item.level * 0.75}rem` }
                      : undefined
                  }
                >
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
