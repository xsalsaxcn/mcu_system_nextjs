"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/shared/types";

export default function NakesAuthGate({
  children,
}: {
  children: (
    user: SessionUser,
    logout: () => Promise<void>,
  ) => React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/wellness/nakes/session", {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => ({
        ...(await response.json().catch(() => ({}))),
        http_status: response.status,
      }))
      .then((result) => {
        if (!result.ok) {
          const next = `${window.location.pathname}${window.location.search}`;
          router.replace(
            `/wellness/nakes-login?next=${encodeURIComponent(next)}`,
          );
          return;
        }
        setUser(result.user);
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function logout() {
    await fetch("/api/wellness/nakes/session", {
      method: "DELETE",
      credentials: "include",
    }).catch(() => null);

    const next = `${window.location.pathname}${window.location.search}`;
    router.replace(`/wellness/nakes-login?next=${encodeURIComponent(next)}`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f8fb] px-4 text-center">
        <div>
          <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600" />
          <div className="mt-4 text-sm font-black text-slate-600">
            Memeriksa akses NAKES...
          </div>
        </div>
      </main>
    );
  }

  if (!user) return null;
  return <>{children(user, logout)}</>;
}
