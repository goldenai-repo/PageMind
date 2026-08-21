"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { ReaderTocItem } from "@/lib/readers/types";

export type ReaderTocSession = {
  items: ReaderTocItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
};

type ReaderTocContextValue = {
  session: ReaderTocSession | null;
  setSession: (session: ReaderTocSession | null) => void;
};

const ReaderTocContext = createContext<ReaderTocContextValue | null>(null);

export function ReaderTocProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<ReaderTocSession | null>(null);
  const setSession = useCallback((next: ReaderTocSession | null) => {
    setSessionState(next);
  }, []);
  const value = useMemo(
    () => ({ session, setSession }),
    [session, setSession],
  );

  return (
    <ReaderTocContext.Provider value={value}>
      {children}
    </ReaderTocContext.Provider>
  );
}

export function useReaderToc() {
  const ctx = useContext(ReaderTocContext);
  if (!ctx) {
    throw new Error("useReaderToc must be used within a ReaderTocProvider.");
  }
  return ctx;
}

/** Safe for trees that may render outside AppShell. */
export function useOptionalReaderToc() {
  return useContext(ReaderTocContext);
}
