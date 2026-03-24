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
  origen_observaciones: string | null;
  destino_calle: string | null;
  destino_altura: string | null;
  destino_localidad: string | null;
  destino_observaciones: string | null;
  pasajero_nombre: string | null;
  pasajero_cantidad: number | null;
  pasajero_telefono: string | null;
  con_espera: boolean | null;
  ida_y_vuelta: boolean | null;
  es_recurrente: boolean | null;
  dias_recurrente: string[] | null;
  hora_recurrente: string | null;
  fecha_inicio_recurrente: string | null;
  fecha_fin_recurrente: string | null;
  centro_costos: string | null;
  solicitado_por: string | null;
  mail_solicitante: string | null;
  notas: string | string[] | null;
  estado: string | null;
  creado_en: string | null;
  numero_reserva_ok: string | null;
};

type Parada = {
  id: number;
  calle: string | null;
  altura: string | null;
  localidad: string | null;
  pasajero_nombre: string | null;
  pasajero_telefono: string | null;
};

type Tab = "pendientes" | "confirmadas" | "rechazadas";
type OrdenCampo = "creado_en" | "fecha_viaje";

function fmt(d: string | null, withTime = false) {
  if (!d) return "-";
  return new Date(d).toLocaleString("es-AR", withTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" });
}

function dir(calle: string | null, altura: string | null, localidad: string | null) {
  const parte = [calle, altura].filter(Boolean).join(" ");
  return parte ? `${parte}${localidad ? `, ${localidad}` : ""}` : "-";
}

function notasText(notas: string | string[] | null) {
  if (!notas) return "-";
  if (Array.isArray(notas)) return notas.join(", ") || "-";
  return notas;
}

export default function MisReservasPage() {
  const router = useRouter();
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("pendientes");
  const [orden, setOrden] = useState<OrdenCampo>("creado_en");
  const [reservaSeleccionada, setReservaSeleccionada] = useState<Reserva | null>(null);
  const [paradasDetalle, setParadasDetalle] = useState<Parada[]>([]);
  const [loadingParadas, setLoadingParadas] = useState(false);

  useEffect(() => {
    const fetchMisReservas = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      setLoading(true);
      setError(null);

      const { data, error: reservasError } = await supabase
        .from("reservas")
        .select("*")
        .eq("usuario_id", session.user.id)
        .order("id", { ascending: false });

      if (reservasError) { setError(reservasError.message); setReservas([]); }
      else { setReservas((data ?? []) as Reserva[]); }
      setLoading(false);
    };
    void fetchMisReservas();
  }, [router]);

  const pendientes = reservas.filter((r) => r.estado === "a_confirmar");
  const confirmadas = reservas.filter((r) => r.estado === "confirmada");
  const rechazadas = reservas.filter((r) => r.estado === "rechazada");
  const base = tab === "pendientes" ? pendientes : tab === "confirmadas" ? confirmadas : rechazadas;

  const reservasFiltradas = [...base].sort((a, b) => {
    const va = (orden === "creado_en" ? a.creado_en : a.fecha_viaje) ?? "";
    const vb = (orden === "creado_en" ? b.creado_en : b.fecha_viaje) ?? "";
    return vb.localeCompare(va); // descendente
  });

  const toggleOrden = () =>
    setOrden((prev) => (prev === "creado_en" ? "fecha_viaje" : "creado_en"));

  const abrirDetalle = async (r: Reserva) => {
    if (reservaSeleccionada?.id === r.id) {
      setReservaSeleccionada(null);
      return;
    }
    setReservaSeleccionada(r);
    setParadasDetalle([]);
    setLoadingParadas(true);
    const { data } = await supabase
      .from("paradas")
      .select("id, calle, altura, localidad, pasajero_nombre, pasajero_telefono")
      .eq("reserva_id", r.id);
    setParadasDetalle((data ?? []) as Parada[]);
    setLoadingParadas(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-600">Cargando tus reservas...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <div className="mx-auto my-8 w-full max-w-6xl rounded-xl bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900">Mis reservas</h1>
          <button type="button" onClick={toggleOrden}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
            {orden === "creado_en" ? "Ordenar por fecha de viaje" : "Ordenar por fecha de solicitud"}
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-red-600" role="alert">{error}</p>}

        {/* Tabs */}
        <div className="mb-4 flex gap-2 border-b border-zinc-200">
          {([
            { key: "pendientes", label: "Pendientes de confirmar", count: pendientes.length, color: "bg-amber-100 text-amber-700" },
            { key: "confirmadas", label: "Confirmadas", count: confirmadas.length, color: "bg-emerald-100 text-emerald-700" },
            { key: "rechazadas", label: "Rechazadas", count: rechazadas.length, color: "bg-red-100 text-red-700" },
          ] as const).map(({ key, label, count, color }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`rounded-t-md px-4 py-2 text-xs font-medium ${
                tab === key
                  ? "border border-b-white border-zinc-200 bg-white text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-50"
              }`}>
              {label}
              {count > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${color}`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {reservasFiltradas.length === 0 ? (
          <p className="text-sm text-zinc-600">
            {tab === "pendientes" ? "No tenés reservas pendientes de confirmación."
              : tab === "confirmadas" ? "No tenés reservas confirmadas."
              : "No tenés reservas rechazadas."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Fecha solicitud</th>
                  <th className="px-3 py-2">Fecha viaje</th>
                  <th className="px-3 py-2">Hora</th>
                  <th className="px-3 py-2">Origen</th>
                  <th className="px-3 py-2">Destino</th>
                  <th className="px-3 py-2">Pasajero</th>
                  <th className="px-3 py-2">Notas</th>
                  <th className="px-3 py-2">Estado</th>
                  {tab === "confirmadas" && <th className="px-3 py-2">Nro. reserva</th>}
                </tr>
              </thead>
              <tbody>
                {reservasFiltradas.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => void abrirDetalle(r)}
                    className={`cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 ${reservaSeleccionada?.id === r.id ? "bg-zinc-50" : ""}`}
                  >
                    <td className="px-3 py-2 text-xs text-zinc-600">{fmt(r.creado_en, true)}</td>
                    <td className="px-3 py-2 text-xs text-zinc-700">{fmt(r.fecha_viaje)}</td>
                    <td className="px-3 py-2 text-xs text-zinc-700">{r.hora_viaje ?? "-"}</td>
                    <td className="px-3 py-2 text-xs text-zinc-700">{dir(r.origen_calle, r.origen_altura, r.origen_localidad)}</td>
                    <td className="px-3 py-2 text-xs text-zinc-700">{dir(r.destino_calle, r.destino_altura, r.destino_localidad)}</td>
                    <td className="px-3 py-2 text-xs text-zinc-700">{r.pasajero_nombre ?? "-"}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-xs text-zinc-600">{notasText(r.notas)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium ${
                        r.estado === "confirmada" ? "text-emerald-700"
                        : r.estado === "rechazada" ? "text-red-600"
                        : "text-amber-700"}`}>
                        {r.estado === "confirmada" ? "Confirmada"
                          : r.estado === "rechazada" ? "Rechazada"
                          : "A confirmar"}
                      </span>
                    </td>
                    {tab === "confirmadas" && (
                      <td className="px-3 py-2 text-xs font-medium text-zinc-700">{r.numero_reserva_ok ?? "-"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Panel de detalle */}
        {reservaSeleccionada && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-base font-semibold text-zinc-900">
                Detalle reserva #{reservaSeleccionada.id}
              </h2>
              <button
                type="button"
                onClick={() => setReservaSeleccionada(null)}
                className="text-xs text-zinc-500 underline hover:text-zinc-800"
              >
                Cerrar
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs md:grid-cols-3 lg:grid-cols-4">
              {([
                ["Fecha solicitud", fmt(reservaSeleccionada.creado_en, true)],
                ["ID Viaje", reservaSeleccionada.id_viaje],
                ["Tipo de viaje", reservaSeleccionada.tipo_viaje],
                ["Fecha viaje", fmt(reservaSeleccionada.fecha_viaje)],
                ["Hora", reservaSeleccionada.hora_viaje],
                ["Origen", dir(reservaSeleccionada.origen_calle, reservaSeleccionada.origen_altura, reservaSeleccionada.origen_localidad)],
                ["Obs. origen", reservaSeleccionada.origen_observaciones],
                ["Destino", dir(reservaSeleccionada.destino_calle, reservaSeleccionada.destino_altura, reservaSeleccionada.destino_localidad)],
                ["Obs. destino", reservaSeleccionada.destino_observaciones],
                ["Pasajero", reservaSeleccionada.pasajero_nombre],
                ["Teléfono", reservaSeleccionada.pasajero_telefono],
                ["Cantidad pasajeros", reservaSeleccionada.pasajero_cantidad?.toString()],
                ["Ida y vuelta", reservaSeleccionada.ida_y_vuelta ? "Sí" : "No"],
                ["Con espera", reservaSeleccionada.con_espera ? "Sí" : "No"],
                ["Recurrente", reservaSeleccionada.es_recurrente ? "Sí" : "No"],
                ["Días recurrente", reservaSeleccionada.dias_recurrente?.join(", ")],
                ["Hora recurrente", reservaSeleccionada.hora_recurrente],
                ["Inicio recurrente", fmt(reservaSeleccionada.fecha_inicio_recurrente)],
                ["Fin recurrente", fmt(reservaSeleccionada.fecha_fin_recurrente)],
                ["Centro de costos", reservaSeleccionada.centro_costos],
                ["Solicitado por", reservaSeleccionada.solicitado_por],
                ["Mail solicitante", reservaSeleccionada.mail_solicitante],
                ["Notas", notasText(reservaSeleccionada.notas)],
                ["Estado", reservaSeleccionada.estado],
              ] as [string, string | null | undefined][]).map(([label, value]) => (
                <div key={label}>
                  <span className="font-medium text-zinc-500">{label}: </span>
                  <span className="text-zinc-800">{value ?? "-"}</span>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold text-zinc-700">Paradas intermedias</h3>
              {loadingParadas ? (
                <p className="text-xs text-zinc-500">Cargando paradas...</p>
              ) : paradasDetalle.length === 0 ? (
                <p className="text-xs text-zinc-500">Sin paradas intermedias.</p>
              ) : (
                <table className="min-w-full text-xs">
                  <thead className="border-b border-zinc-200 text-[10px] uppercase text-zinc-500">
                    <tr>
                      <th className="px-2 py-1 text-left">#</th>
                      <th className="px-2 py-1 text-left">Dirección</th>
                      <th className="px-2 py-1 text-left">Pasajero</th>
                      <th className="px-2 py-1 text-left">Teléfono</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paradasDetalle.map((p, i) => (
                      <tr key={p.id} className="border-b border-zinc-100">
                        <td className="px-2 py-1 text-zinc-500">{i + 1}</td>
                        <td className="px-2 py-1 text-zinc-700">{dir(p.calle, p.altura, p.localidad)}</td>
                        <td className="px-2 py-1 text-zinc-700">{p.pasajero_nombre ?? "-"}</td>
                        <td className="px-2 py-1 text-zinc-700">{p.pasajero_telefono ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
