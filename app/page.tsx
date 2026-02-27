"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        router.replace("/reservas/nueva");
      } else {
        router.replace("/login");
      }
    };

    void checkSession();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <p className="text-sm text-zinc-600">Redirigiendo...</p>
    </div>
  );
}
