import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageLoading } from "@/components/ui";

// Every screen here is client-rendered behind sign-in, so there is no static shell to validate.
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {/* Pages read the query string (filters, tabs), which needs a Suspense boundary. */}
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </AppShell>
  );
}
