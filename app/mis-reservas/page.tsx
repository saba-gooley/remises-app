"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Reserva = {
  id: number;
  id_viaje: string | null;
  fecha_viaje: string | null;
  hora_viaje: string | null;
  origen_calle: string | null;
  origen_altura: string | null;
  origen_localidad: string | null;
  destino_calle: string | null;
  destino_altura: string | null;
  destino_localidad: string | null;
  pasajero_nombre: string | null;
  estado: string | null;
  creado_en: string | null;
};

type Tab = "pendientes" | "confirmadas" | "rechazadas";

export default function MisReservasPage() {
  const router = useRouter();
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("pendientes");

  useEffect(() => {
    const fetchMisReservas = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: reservasError } = await supabase
        .from("reservas")
        .select(
          "id, id_viaje, fecha_viaje, hora_viaje, origen_calle, origen_altura, origen_localidad, destino_calle, destino_altura, destino_localidad, pasajero_nombre, estado, creado_en",
        )
        .eq("usuario_id", session.user.id)
        .order("id", { ascending: false });

      if (reservasError) {
        setError(reservasError.message);
        setReservas([]);
      } else {
        setReservas((data ?? []) as Reserva[]);
      }
      setLoading(false);
    };

    void fetchMisReservas();
  }, [router]);

  const formatFechaHora = (
    fechaViaje: string | null,
    horaViaje: string | null,
  ) => {
    if (!fechaViaje) return "-";
    if (horaViaje) {
      const d = new Date(`${fechaViaje}T${horaViaje}`);
      return d.toLocaleString("es-AR", {
        dateStyle: "short",
        timeStyle: "short",
      });
    }
    return new Date(fechaViaje).toLocaleDateString("es-AR", {
      dateStyle: "short",
    });
  };

  const formatDireccion = (
    calle: string | null,
    altura: string | null,
    localidad: string | null,
  ) => {
    const parte = [calle, altura].filter(Boolean).join(" ");
    return parte ? `${parte}${localidad ? `, ${localidad}` : ""}` : "-";
  };

  const pendientes = reservas.filter((r) => r.estado === "a_confirmar");
  const confirmadas = reservas.filter((r) => r.estado === "confirmada");
  const rechazadas = reservas.filter((r) => r.estado === "rechazada");
  const reservasFiltradas =
    tab === "pendientes" ? pendientes : tab === "confirmadas" ? confirmadas : rechazadas;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-600">Cargando tus reservas...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <div className="mx-auto my-8 w-full max-w-5xl rounded-xl bg-white p-6 shadow">
        <h1 className="mb-4 text-2xl font-semibold text-zinc-900">
          Mis reservas
        </h1>

        {error && (
          <p className="mb-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {/* Tabs */}
        <div className="mb-4 flex gap-2 border-b border-zinc-200">
          <button
            type="button"
            onClick={() => setTab("pendientes")}
            className={`rounded-t-md px-4 py-2 text-xs font-medium ${
              tab === "pendientes"
                ? "border border-b-white border-zinc-200 bg-white text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Pendientes de confirmar
            {pendientes.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                {pendientes.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab("confirmadas")}
            className={`rounded-t-md px-4 py-2 text-xs font-medium ${
              tab === "confirmadas"
                ? "border border-b-white border-zinc-200 bg-white text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Confirmadas
            {confirmadas.length > 0 && (
              <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                {confirmadas.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab("rechazadas")}
            className={`rounded-t-md px-4 py-2 text-xs font-medium ${
              tab === "rechazadas"
                ? "border border-b-white border-zinc-200 bg-white text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Rechazadas
            {rechazadas.length > 0 && (
              <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                {rechazadas.length}
              </span>
            )}
          </button>
        </div>

        {reservasFiltradas.length === 0 ? (
          <p className="text-sm text-zinc-600">
            {tab === "pendientes"
              ? "No tenés reservas pendientes de confirmación."
              : tab === "confirmadas"
                ? "No tenés reservas confirmadas."
                : "No tenés reservas rechazadas."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Nº</th>
                  <th className="px-3 py-2">Fecha solicitud</th>
                  <th className="px-3 py-2">Fecha y hora viaje</th>
                  <th className="px-3 py-2">Origen</th>
                  <th className="px-3 py-2">Destino</th>
                  <th className="px-3 py-2">Pasajero</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {reservasFiltradas.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-zinc-100 hover:bg-zinc-50"
                  >
                    <td className="px-3 py-2 text-xs text-zinc-500">{r.id}</td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {r.creado_en
                        ? new Date(r.creado_en).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-zinc-700">
                      {formatFechaHora(r.fecha_viaje, r.hora_viaje)}
                    </td>
                    <td className="px-3 py-2 text-zinc-700">
                      {formatDireccion(
                        r.origen_calle,
                        r.origen_altura,
                        r.origen_localidad,
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-700">
                      {formatDireccion(
                        r.destino_calle,
                        r.destino_altura,
                        r.destino_localidad,
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-700">
                      {r.pasajero_nombre ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          r.estado === "confirmada"
                            ? "font-medium text-emerald-700"
                            : r.estado === "rechazada"
                              ? "font-medium text-red-600"
                              : "font-medium text-amber-700"
                        }
                      >
                        {r.estado === "confirmada"
                          ? "Confirmada"
                          : r.estado === "rechazada"
                            ? "Rechazada"
                            : "A confirmar"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
