"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import type { SessionUser } from "@/lib/shared/types";

export default function AuthGate({ children }: { children: (user: SessionUser) => React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) {
          router.replace("/login");
          return;
        }
        setUser(data.user);
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Memuat aplikasi...</div>;
  }

  if (!user) return null;

  return <AppShell user={user}>{children(user)}</AppShell>;
}
