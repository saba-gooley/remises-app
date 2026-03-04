"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [isOperador, setIsOperador] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setEmail(null);
        setIsOperador(false);
        setLoading(false);
        return;
      }

      const userEmail = session.user.email ?? null;
      setEmail(userEmail);

      const { data: usuario } = await supabase
        .from("usuarios")
        .select("es_operador")
        .eq("email", userEmail)
        .maybeSingle();

      setIsOperador(Boolean(usuario?.es_operador));
      setLoading(false);
    };

    void loadUser();
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const linkClass = (href: string) => {
    const isActive = pathname === href || pathname.startsWith(`${href}/`);
    return `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? "bg-zinc-900 text-white"
        : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
    }`;
  };

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold text-zinc-900">
            Remises corporativos
          </span>
          <nav className="flex items-center gap-2">
            <Link href="/reservas/nueva" className={linkClass("/reservas/nueva")}>
              Nueva Reserva
            </Link>
            <Link href="/mis-reservas" className={linkClass("/mis-reservas")}>
              Mis Reservas
            </Link>
            <Link href="/consultas/nueva" className={linkClass("/consultas/nueva")}>
              Nueva Consulta
            </Link>
            <Link href="/mis-consultas" className={linkClass("/mis-consultas")}>
              Mis Consultas
            </Link>
            {isOperador && (
              <Link href="/admin" className={linkClass("/admin")}>
                Panel Admin
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {!loading && email && (
            <span className="text-xs text-zinc-600">{email}</span>
          )}
          {!loading && email && (
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingOut ? "Cerrando..." : "Cerrar sesión"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

