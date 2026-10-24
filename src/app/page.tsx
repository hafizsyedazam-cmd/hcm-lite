"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Spinner } from "@/components/ui";

/** Entry: first-run setup → login → dashboard. */
export default function Home() {
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    fetch("/api/setup")
      .then((r) => r.json())
      .then((s) => {
        if (!s.setupComplete) router.replace("/setup");
        else router.replace(me ? "/dashboard" : "/login");
      })
      .catch(() => router.replace("/login"));
  }, [me, loading, router]);

  return (
    <div className="splash">
      <Spinner />
    </div>
  );
}
