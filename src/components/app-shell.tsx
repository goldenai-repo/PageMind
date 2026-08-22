"use client";

import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import {
  ReaderTocProvider,
  useOptionalReaderToc,
} from "@/components/reader-toc-context";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function AppShell({
  user,
  title,
  description,
  children,
}: {
  user: { name: string; email: string };
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <ReaderTocProvider>
      <AppShellLayout user={user} title={title} description={description}>
        {children}
      </AppShellLayout>
    </ReaderTocProvider>
  );
}

function AppShellLayout({
  user,
  title,
  description,
  children,
}: {
  user: { name: string; email: string };
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const reading = Boolean(useOptionalReaderToc()?.session);

  return (
    <SidebarProvider
      className={cn(reading && "h-svh overflow-hidden")}
    >
      <Suspense fallback={null}>
        <AppSidebar user={user} />
      </Suspense>
      <SidebarInset className={cn(reading && "min-h-0 overflow-hidden")}>
        {reading ? null : (
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-vertical:h-4 data-vertical:self-auto"
              />
              <div>
                <h1 className="text-[0.95rem] font-semibold tracking-tight text-navy">
                  {title}
                </h1>
                {description ? (
                  <p className="text-[0.75rem] text-muted-foreground">
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
          </header>
        )}
        <div
          className={
            reading
              ? "flex min-h-0 flex-1 flex-col"
              : "flex flex-1 flex-col gap-4 p-4 md:p-6"
          }
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
