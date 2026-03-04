"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Consulta = {
  id: number;
  estado: "pendiente" | "disponible" | "no_disponible" | "convertida" | null;
  fecha_viaje: string | null;
  hora_viaje: string | null;
  origen_calle: string | null;
  origen_altura: string | null;
  origen_localidad: string | null;
  destino_calle: string | null;
  destino_altura: string | null;
  destino_localidad: string | null;
  pasajero_nombre: string | null;
  notas: string | null;
  respuesta_operador: string | null;
  creado_en: string | null;
  // todos los campos para convertir en reserva
  tipo_viaje: string | null;
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
  usuario_id: string | null;
  cliente_id: string | null;
  pasajero_cantidad: number | null;
  pasajero_telefono: string | null;
  origen_observaciones: string | null;
  destino_observaciones: string | null;
};

function fmt(d: string | null, withTime = false) {
  if (!d) return "-";
  return new Date(d).toLocaleString("es-AR", withTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" });
}

function dir(c: string | null, a: string | null, l: string | null) {
  const p = [c, a].filter(Boolean).join(" ");
  return p ? `${p}${l ? `, ${l}` : ""}` : "-";
}

const ESTADO_STYLES: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-800",
  disponible: "bg-emerald-100 text-emerald-800",
  no_disponible: "bg-red-100 text-red-700",
  convertida: "bg-zinc-100 text-zinc-600",
};

const ESTADO_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  disponible: "Disponible",
  no_disponible: "No disponible",
  convertida: "Convertida",
};

export default function MisConsultasPage() {
  const router = useRouter();
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [convirtiendo, setConvirtiendo] = useState<number | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      setLoading(true);
      const { data, error: err } = await supabase
        .from("consultas")
        .select("*")
        .eq("usuario_id", session.user.id)
        .order("id", { ascending: false });

      if (err) { setError(err.message); setConsultas([]); }
      else setConsultas((data ?? []) as Consulta[]);
      setLoading(false);
    };
    void fetch();
  }, [router]);

  const convertirEnReserva = async (consulta: Consulta) => {
    setConvirtiendo(consulta.id);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const reservaPayload = {
        usuario_id: consulta.usuario_id,
        cliente_id: consulta.cliente_id,
        tipo_viaje: consulta.tipo_viaje,
        fecha_viaje: consulta.fecha_viaje,
        hora_viaje: consulta.hora_viaje,
        origen_calle: consulta.origen_calle,
        origen_altura: consulta.origen_altura,
        origen_localidad: consulta.origen_localidad,
        origen_observaciones: consulta.origen_observaciones,
        destino_calle: consulta.destino_calle,
        destino_altura: consulta.destino_altura,
        destino_localidad: consulta.destino_localidad,
        destino_observaciones: consulta.destino_observaciones,
        pasajero_nombre: consulta.pasajero_nombre,
        pasajero_cantidad: consulta.pasajero_cantidad ?? 1,
        pasajero_telefono: consulta.pasajero_telefono,
        con_espera: consulta.con_espera ?? false,
        ida_y_vuelta: consulta.ida_y_vuelta ?? false,
        es_recurrente: consulta.es_recurrente ?? false,
        dias_recurrente: consulta.dias_recurrente,
        hora_recurrente: consulta.hora_recurrente,
        fecha_inicio_recurrente: consulta.fecha_inicio_recurrente,
        fecha_fin_recurrente: consulta.fecha_fin_recurrente,
        centro_costos: consulta.centro_costos,
        solicitado_por: consulta.solicitado_por,
        mail_solicitante: session?.user?.email ?? consulta.mail_solicitante,
        notas: consulta.notas ? [consulta.notas] : [],
        estado: "a_confirmar",
        creado_en: new Date().toISOString(),
      };

      const { data: reservaInsertada, error: reservaError } = await supabase
        .from("reservas")
        .insert(reservaPayload)
        .select("id")
        .single();

      if (reservaError) throw reservaError;

      const { error: updateError } = await supabase
        .from("consultas")
        .update({ estado: "convertida", reserva_id: reservaInsertada.id })
        .eq("id", consulta.id);

      if (updateError) throw updateError;

      router.push("/mis-reservas");
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Error al convertir la consulta en reserva.");
    } finally {
      setConvirtiendo(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-600">Cargando tus consultas...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <div className="mx-auto my-8 w-full max-w-6xl rounded-xl bg-white p-6 shadow">
        <h1 className="mb-4 text-2xl font-semibold text-zinc-900">Mis consultas</h1>

        {error && <p className="mb-3 text-sm text-red-600" role="alert">{error}</p>}

        {consultas.length === 0 ? (
          <p className="text-sm text-zinc-600">No tenés consultas registradas.</p>
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
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Respuesta del operador</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {consultas.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-3 py-2 text-xs text-zinc-600">{fmt(c.creado_en, true)}</td>
                    <td className="px-3 py-2 text-xs text-zinc-700">{fmt(c.fecha_viaje)}</td>
                    <td className="px-3 py-2 text-xs text-zinc-700">{c.hora_viaje ?? "-"}</td>
                    <td className="px-3 py-2 text-xs text-zinc-700">{dir(c.origen_calle, c.origen_altura, c.origen_localidad)}</td>
                    <td className="px-3 py-2 text-xs text-zinc-700">{dir(c.destino_calle, c.destino_altura, c.destino_localidad)}</td>
                    <td className="px-3 py-2 text-xs text-zinc-700">{c.pasajero_nombre ?? "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_STYLES[c.estado ?? "pendiente"] ?? ""}`}>
                        {ESTADO_LABELS[c.estado ?? "pendiente"] ?? c.estado}
                      </span>
                    </td>
                    <td className="max-w-[200px] px-3 py-2 text-xs text-zinc-600">
                      {c.respuesta_operador ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      {c.estado === "disponible" && (
                        <button
                          type="button"
                          disabled={convirtiendo === c.id}
                          onClick={() => void convertirEnReserva(c)}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {convirtiendo === c.id ? "Convirtiendo..." : "Convertir en reserva"}
                        </button>
                      )}
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
