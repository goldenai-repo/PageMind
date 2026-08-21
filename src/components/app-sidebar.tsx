"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookMarked,
  BookOpen,
  CheckCircle2,
  Home,
  Library,
  Star,
  Upload,
} from "lucide-react";

import { NavUser } from "@/components/nav-user";
import { useOptionalReaderToc } from "@/components/reader-toc-context";
import { ReaderTocNav } from "@/components/reader-toc-sidebar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const browseNav = [
  {
    title: "Home",
    href: "/library",
    shelf: "home",
    icon: Home,
  },
] as const;

const myLibrary = [
  {
    title: "My Books",
    href: "/library?shelf=mine",
    shelf: "mine",
    icon: Library,
  },
  {
    title: "Favorite",
    href: "/library?shelf=favorite",
    shelf: "favorite",
    icon: Star,
  },
  {
    title: "Want to Read",
    href: "/library?shelf=want",
    shelf: "want",
    icon: BookMarked,
  },
  {
    title: "Finished",
    href: "/library?shelf=finished",
    shelf: "finished",
    icon: CheckCircle2,
  },
] as const;

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeShelf = searchParams.get("shelf") ?? "home";
  const onLibrary = pathname.startsWith("/library");
  const onUpload = pathname.startsWith("/upload");
  const toc = useOptionalReaderToc()?.session;
  const reading = Boolean(toc);
  const { setOpen } = useSidebar();
  const wasReading = useRef(false);

  useEffect(() => {
    if (reading && !wasReading.current) {
      setOpen(true);
    }
    wasReading.current = reading;
  }, [reading, setOpen]);

  const goHome = () => {
    toc?.onClose();
    if (!pathname.startsWith("/library")) {
      router.push("/library");
    }
  };

  return (
    <Sidebar collapsible={reading ? "offcanvas" : "icon"} {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              {...(reading
                ? { onClick: goHome }
                : { render: <Link href="/library" /> })}
              className="hover:bg-sidebar-accent"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-navy text-white">
                <BookOpen className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold text-navy">
                  PageMind
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  AI PDF Reader
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {toc ? (
          <ReaderTocNav
            items={toc.items}
            activeId={toc.activeId}
            onSelect={toc.onSelect}
          />
        ) : (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Browse</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {browseNav.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={onLibrary && activeShelf === item.shelf}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>My Library</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {myLibrary.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={onLibrary && activeShelf === item.shelf}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Manage</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Upload"
                      isActive={onUpload}
                      render={<Link href="/upload" />}
                    >
                      <Upload />
                      <span>Upload</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      {!reading ? (
        <SidebarFooter>
          <NavUser user={user} />
        </SidebarFooter>
      ) : null}
      <SidebarRail />
    </Sidebar>
  );
}
