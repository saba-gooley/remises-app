"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Reserva = {
  id: number;
  id_viaje: string | null;
  tipo_viaje: string | null;
  fecha_viaje: string | null;
  hora_viaje: string | null;
  origen_calle: string | null;
  origen_altura: string | null;
  origen_localidad: string | null;
  destino_calle: string | null;
  destino_altura: string | null;
  destino_localidad: string | null;
  pasajero_nombre: string | null;
  centro_costos: string | null;
  solicitado_por: string | null;
  estado: string | null;
};

export default function AdminPage() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchReservas = async () => {
    setLoading(true);
    setError(null);
    const { data, error: reservasError } = await supabase
      .from("reservas")
      .select("*")
      .eq("estado", "a_confirmar")
      .order("fecha_viaje", { ascending: true })
      .order("hora_viaje", { ascending: true });

    if (reservasError) {
      setError(reservasError.message);
      setReservas([]);
    } else {
      setReservas(data as Reserva[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: usuario } = await supabase
        .from("usuarios")
        .select("es_operador")
        .eq("email", session.user.email)
        .maybeSingle();

      if (!usuario?.es_operador) {
        router.replace("/login");
        return;
      }

      await fetchReservas();
    };

    void checkAuthAndFetch();
  }, [router]);

  const handleAccion = async (
    id: number,
    nuevoEstado: "confirmada" | "rechazada",
  ) => {
    setActionLoadingId(id);
    setError(null);

    if (nuevoEstado === "confirmada") {
      const response = await fetch("/api/confirmar-reserva", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reservaId: id }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(
          data?.error ??
            "Ocurrió un error al confirmar la reserva. Intentá nuevamente.",
        );
      } else {
        setReservas((prev) => prev.filter((r) => r.id !== id));
      }
    } else {
      const { error: updateError } = await supabase
        .from("reservas")
        .update({ estado: nuevoEstado })
        .eq("id", id);

      if (updateError) {
        setError(updateError.message);
      } else {
        setReservas((prev) => prev.filter((r) => r.id !== id));
      }
    }

    setActionLoadingId(null);
  };

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <div className="mx-auto my-8 w-full max-w-6xl rounded-xl bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Panel del operador
            </h1>
            <p className="text-sm text-zinc-600">
              Reservas pendientes de confirmación.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchReservas()}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Actualizar
          </button>
        </div>

        {error && (
          <p className="mb-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-zinc-600">Cargando reservas...</p>
        ) : reservas.length === 0 ? (
          <p className="text-sm text-zinc-600">
            No hay reservas con estado &quot;a_confirmar&quot;.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">ID Viaje</th>
                  <th className="px-3 py-2">Fecha y hora</th>
                  <th className="px-3 py-2">Origen</th>
                  <th className="px-3 py-2">Destino</th>
                  <th className="px-3 py-2">Pasajero</th>
                  <th className="px-3 py-2">Centro costos</th>
                  <th className="px-3 py-2">Solicitado por</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {reservas.map((reserva) => (
                  <tr
                    key={reserva.id}
                    className="border-b border-zinc-100 hover:bg-zinc-50"
                  >
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {reserva.id}
                    </td>
                    <td className="px-3 py-2 text-sm text-zinc-900">
                      {reserva.id_viaje}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-700">
                      {reserva.fecha_viaje && reserva.hora_viaje
                        ? `${reserva.fecha_viaje} ${reserva.hora_viaje}`
                        : reserva.fecha_viaje ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-700">
                      {reserva.origen_calle} {reserva.origen_altura}
                      <br />
                      <span className="text-[11px] text-zinc-500">
                        {reserva.origen_localidad}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-700">
                      {reserva.destino_calle} {reserva.destino_altura}
                      <br />
                      <span className="text-[11px] text-zinc-500">
                        {reserva.destino_localidad}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-700">
                      {reserva.pasajero_nombre}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-700">
                      {reserva.centro_costos}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-700">
                      {reserva.solicitado_por}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={actionLoadingId === reserva.id}
                          onClick={() =>
                            void handleAccion(reserva.id, "confirmada")
                          }
                          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionLoadingId === reserva.id
                            ? "Procesando..."
                            : "Confirmar"}
                        </button>
                        <button
                          type="button"
                          disabled={actionLoadingId === reserva.id}
                          onClick={() =>
                            void handleAccion(reserva.id, "rechazada")
                          }
                          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Rechazar
                        </button>
                      </div>
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

