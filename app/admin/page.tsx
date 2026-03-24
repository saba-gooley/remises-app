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
  cliente_id: string | null;
  numero_reserva_ok: string | null;
  chofer: string | null;
  archivo_url: string | null;
};

type Parada = {
  id: number;
  calle: string | null;
  altura: string | null;
  localidad: string | null;
  pasajero_nombre: string | null;
  pasajero_telefono: string | null;
};

type Cliente = {
  id: string;
  nombre: string | null;
  configuracion_campos: Record<string, unknown> | null;
};

type Usuario = {
  id: string;
  email: string | null;
  cliente_id: string | null;
};

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
  notas: string | string[] | null;
  mail_solicitante: string | null;
  respuesta_operador: string | null;
  creado_en: string | null;
  cliente_id: string | null;
  id_viaje: string | null;
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
  pasajero_cantidad: number | null;
  pasajero_telefono: string | null;
};

function fmt(d: string | null, withTime = false) {
  if (!d) return "-";
  return new Date(d).toLocaleString("es-AR", withTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" });
}

function dir(calle: string | null, altura: string | null, localidad: string | null) {
  const partes = [calle, altura].filter(Boolean).join(" ");
  return partes ? `${partes}${localidad ? `, ${localidad}` : ""}` : "-";
}

export default function AdminPage() {
  const router = useRouter();
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"reservas" | "consultas" | "clientes">("reservas");

  // Modal detalle reserva
  const [reservaSeleccionada, setReservaSeleccionada] = useState<Reserva | null>(null);
  const [paradasModal, setParadasModal] = useState<Parada[]>([]);
  const [loadingParadas, setLoadingParadas] = useState(false);
  const [modalNumeroReserva, setModalNumeroReserva] = useState("");
  const [modalChofer, setModalChofer] = useState("");
  const [modalArchivoUrl, setModalArchivoUrl] = useState<string | null>(null);
  const [modalArchivoNombre, setModalArchivoNombre] = useState<string | null>(null);
  const [uploadingArchivo, setUploadingArchivo] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [showConfirmSinArchivo, setShowConfirmSinArchivo] = useState(false);

  // Consultas
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [loadingConsultas, setLoadingConsultas] = useState(false);
  const [consultaSeleccionada, setConsultaSeleccionada] = useState<Consulta | null>(null);
  const [respuestaTexto, setRespuestaTexto] = useState<Record<number, string>>({});
  const [actionLoadingConsultaId, setActionLoadingConsultaId] = useState<number | null>(null);

  // Clientes y usuarios
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [clientesLoading, setClientesLoading] = useState(false);
  const [clientesError, setClientesError] = useState<string | null>(null);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [savingCliente, setSavingCliente] = useState(false);
  const [savingAsignacionId, setSavingAsignacionId] = useState<string | null>(null);
  const [editandoClienteId, setEditandoClienteId] = useState<string | null>(null);

  const CAMPOS_CONFIG = [
    { key: "id_viaje", label: "ID Viaje" },
    { key: "centro_costos", label: "Centro de Costos" },
    { key: "solicitado_por", label: "Solicitado Por" },
    { key: "pasajero_telefono", label: "Teléfono del pasajero" },
    { key: "pasajero_cantidad", label: "Cantidad de pasajeros" },
    { key: "origen_observaciones", label: "Observaciones de origen" },
    { key: "destino_observaciones", label: "Observaciones de destino" },
    { key: "notas", label: "Notas" },
  ] as const;

  const [checkboxConfig, setCheckboxConfig] = useState<Record<string, boolean>>(
    Object.fromEntries(CAMPOS_CONFIG.map((c) => [c.key, false])),
  );

  const fetchReservas = async () => {
    setLoading(true);
    setError(null);
    const { data, error: reservasError } = await supabase
      .from("reservas")
      .select("*")
      .eq("estado", "a_confirmar")
      .order("creado_en", { ascending: true });

    if (reservasError) {
      // Fallback si creado_en no existe como columna
      const { data: data2, error: err2 } = await supabase
        .from("reservas")
        .select("*")
        .eq("estado", "a_confirmar")
        .order("id", { ascending: true });
      if (err2) { setError(err2.message); setReservas([]); }
      else setReservas((data2 ?? []) as Reserva[]);
    } else {
      setReservas((data ?? []) as Reserva[]);
    }
    setLoading(false);
  };

  const fetchConsultas = async () => {
    setLoadingConsultas(true);
    const { data, error: err } = await supabase
      .from("consultas")
      .select("*")
      .eq("estado", "pendiente")
      .order("creado_en", { ascending: true });
    if (!err) setConsultas((data ?? []) as Consulta[]);
    setLoadingConsultas(false);
  };

  const fetchClientesYUsuarios = async () => {
    setClientesLoading(true);
    setClientesError(null);
    const { data: clientesData, error: clientesErr } = await supabase
      .from("clientes").select("id, nombre, configuracion_campos");
    const { data: usuariosData, error: usuariosErr } = await supabase
      .from("usuarios").select("id, email, cliente_id");
    if (clientesErr || usuariosErr) {
      setClientesError(clientesErr?.message ?? usuariosErr?.message ?? "Error al cargar.");
      setClientes([]); setUsuarios([]);
    } else {
      setClientes((clientesData ?? []) as Cliente[]);
      setUsuarios((usuariosData ?? []) as Usuario[]);
    }
    setClientesLoading(false);
  };

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: usuario } = await supabase.from("usuarios")
        .select("es_operador").eq("email", session.user.email).maybeSingle();
      if (!usuario?.es_operador) { router.replace("/login"); return; }
      await fetchReservas();
      await fetchConsultas();
      await fetchClientesYUsuarios();
    };
    void checkAuthAndFetch();
  }, [router]);

  const abrirModal = async (reserva: Reserva) => {
    setReservaSeleccionada(reserva);
    setModalNumeroReserva(reserva.numero_reserva_ok ?? "");
    setModalChofer(reserva.chofer ?? "");
    setModalArchivoUrl(reserva.archivo_url ?? null);
    setModalArchivoNombre(reserva.archivo_url ? (reserva.archivo_url.split("/").pop() ?? null) : null);
    setModalError(null);
    setShowConfirmSinArchivo(false);
    setParadasModal([]);
    setLoadingParadas(true);
    const { data } = await supabase.from("paradas")
      .select("id, calle, altura, localidad, pasajero_nombre, pasajero_telefono")
      .eq("reserva_id", reserva.id);
    setParadasModal((data ?? []) as Parada[]);
    setLoadingParadas(false);
  };

  const handleUploadArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !reservaSeleccionada) return;
    setUploadingArchivo(true);
    setModalError(null);
    const fileName = `${reservaSeleccionada.id}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("archivos-reservas")
      .upload(fileName, file, { upsert: true });
    if (uploadError) {
      setModalError(`Error al subir archivo: ${uploadError.message}`);
      setUploadingArchivo(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("archivos-reservas").getPublicUrl(fileName);
    setModalArchivoUrl(urlData.publicUrl);
    setModalArchivoNombre(file.name);
    setUploadingArchivo(false);
  };

  const handleConfirmar = async (forzarSinArchivo = false) => {
    if (!reservaSeleccionada) return;
    if (!modalNumeroReserva.trim()) {
      setModalError("Debe ingresar el número de reserva antes de confirmar.");
      return;
    }
    if (!modalArchivoUrl && !forzarSinArchivo) {
      setShowConfirmSinArchivo(true);
      return;
    }
    setShowConfirmSinArchivo(false);
    setActionLoadingId(reservaSeleccionada.id);
    setModalError(null);
    const response = await fetch("/api/confirmar-reserva", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservaId: reservaSeleccionada.id,
        numero_reserva_ok: modalNumeroReserva.trim(),
        chofer: modalChofer.trim() || null,
        archivo_url: modalArchivoUrl ?? null,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setModalError(data?.error ?? "Error al confirmar. Intentá nuevamente.");
    } else {
      setReservas((prev) => prev.filter((r) => r.id !== reservaSeleccionada.id));
      setReservaSeleccionada(null);
    }
    setActionLoadingId(null);
  };

  const handleRechazar = async (id: number) => {
    setActionLoadingId(id);
    setError(null);
    const { error: updateError } = await supabase.from("reservas")
      .update({ estado: "rechazada" }).eq("id", id);
    if (updateError) { setError(updateError.message); }
    else {
      setReservas((prev) => prev.filter((r) => r.id !== id));
      if (reservaSeleccionada?.id === id) setReservaSeleccionada(null);
    }
    setActionLoadingId(null);
  };

  const resetFormCliente = () => {
    setNuevoClienteNombre("");
    setCheckboxConfig(Object.fromEntries(CAMPOS_CONFIG.map((c) => [c.key, false])));
    setEditandoClienteId(null);
  };

  const handleEditarCliente = (cliente: Cliente) => {
    setEditandoClienteId(cliente.id);
    setNuevoClienteNombre(cliente.nombre ?? "");
    const cfg = (cliente.configuracion_campos ?? {}) as Record<string, boolean>;
    setCheckboxConfig(Object.fromEntries(CAMPOS_CONFIG.map((c) => [c.key, !!cfg[c.key]])));
  };

  const handleGuardarCliente = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setSavingCliente(true);
    setClientesError(null);
    const configuracion_campos = Object.fromEntries(
      CAMPOS_CONFIG.map((c) => [c.key, !!checkboxConfig[c.key]]),
    );
    try {
      if (editandoClienteId) {
        const { error: updateError } = await supabase.from("clientes")
          .update({ nombre: nuevoClienteNombre || null, configuracion_campos })
          .eq("id", editandoClienteId);
        if (updateError) { setClientesError(updateError.message); }
        else { resetFormCliente(); await fetchClientesYUsuarios(); }
      } else {
        const { error: insertError } = await supabase.from("clientes")
          .insert({ nombre: nuevoClienteNombre || null, configuracion_campos });
        if (insertError) { setClientesError(insertError.message); }
        else { resetFormCliente(); await fetchClientesYUsuarios(); }
      }
    } catch (e: unknown) {
      setClientesError((e as Error)?.message ?? "Error al guardar.");
    } finally {
      setSavingCliente(false);
    }
  };

  const handleAsignarCliente = async (usuarioId: string, clienteId: string | null) => {
    setSavingAsignacionId(usuarioId);
    setClientesError(null);
    const { error: updateError } = await supabase.from("usuarios")
      .update({ cliente_id: clienteId }).eq("id", usuarioId);
    if (updateError) { setClientesError(updateError.message); }
    else { await fetchClientesYUsuarios(); }
    setSavingAsignacionId(null);
  };

  const handleResponderConsulta = async (id: number, nuevoEstado: "disponible" | "no_disponible") => {
    setActionLoadingConsultaId(id);
    const respuesta = respuestaTexto[id] ?? null;
    const { error: updateError } = await supabase.from("consultas")
      .update({ estado: nuevoEstado, respuesta_operador: respuesta })
      .eq("id", id);
    if (!updateError) {
      setConsultas((prev) => prev.filter((c) => c.id !== id));
      if (consultaSeleccionada?.id === id) setConsultaSeleccionada(null);
    }
    setActionLoadingConsultaId(null);
  };

  const clienteNombre = (clienteId: string | null) =>
    clientes.find((c) => c.id === clienteId)?.nombre ?? "-";

  const notasText = (notas: string | string[] | null) => {
    if (!notas) return "-";
    if (Array.isArray(notas)) return notas.join(", ") || "-";
    return notas;
  };

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <div className="mx-auto my-8 w-full max-w-7xl rounded-xl bg-white p-6 shadow">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-zinc-900">Panel del operador</h1>
          <p className="text-sm text-zinc-600">Gestión de reservas y clientes.</p>
        </div>

        <div className="mb-4 flex gap-2 border-b border-zinc-200">
          {([
            { key: "reservas", label: "Reservas a confirmar" },
            { key: "consultas", label: "Consultas pendientes" },
            { key: "clientes", label: "Gestión de Clientes" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`rounded-t-md px-4 py-2 text-xs font-medium ${
                activeTab === key
                  ? "border border-b-white border-zinc-200 bg-white text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "consultas" ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="text-sm text-zinc-600">Consultas de disponibilidad pendientes de respuesta.</p>
              <button type="button" onClick={() => void fetchConsultas()}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                Actualizar
              </button>
            </div>

            {loadingConsultas ? (
              <p className="text-sm text-zinc-600">Cargando consultas...</p>
            ) : consultas.length === 0 ? (
              <p className="text-sm text-zinc-600">No hay consultas pendientes.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Fecha solicitud</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Fecha viaje</th>
                      <th className="px-3 py-2">Hora</th>
                      <th className="px-3 py-2">Origen</th>
                      <th className="px-3 py-2">Destino</th>
                      <th className="px-3 py-2">Pasajero</th>
                      <th className="px-3 py-2">Mail solicitante</th>
                      <th className="px-3 py-2">Respuesta</th>
                      <th className="px-3 py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consultas.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setConsultaSeleccionada(consultaSeleccionada?.id === c.id ? null : c)}
                        className={`cursor-pointer border-b border-zinc-100 hover:bg-blue-50 ${consultaSeleccionada?.id === c.id ? "bg-blue-50" : ""}`}
                      >
                        <td className="px-3 py-2 text-xs text-zinc-600">{fmt(c.creado_en, true)}</td>
                        <td className="px-3 py-2 text-xs font-medium text-zinc-800">{clienteNombre(c.cliente_id)}</td>
                        <td className="px-3 py-2 text-xs text-zinc-700">{fmt(c.fecha_viaje)}</td>
                        <td className="px-3 py-2 text-xs text-zinc-700">{c.hora_viaje ?? "-"}</td>
                        <td className="px-3 py-2 text-xs text-zinc-700">{dir(c.origen_calle, c.origen_altura, c.origen_localidad)}</td>
                        <td className="px-3 py-2 text-xs text-zinc-700">{dir(c.destino_calle, c.destino_altura, c.destino_localidad)}</td>
                        <td className="px-3 py-2 text-xs text-zinc-700">{c.pasajero_nombre ?? "-"}</td>
                        <td className="px-3 py-2 text-xs text-zinc-600">{c.mail_solicitante ?? "-"}</td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            placeholder="Respuesta opcional"
                            value={respuestaTexto[c.id] ?? ""}
                            onChange={(e) => setRespuestaTexto((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            className="w-40 rounded-md border border-zinc-300 px-2 py-1 text-xs shadow-sm focus:border-zinc-900 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={actionLoadingConsultaId === c.id}
                              onClick={() => void handleResponderConsulta(c.id, "disponible")}
                              className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                              Hay disponibilidad
                            </button>
                            <button type="button" disabled={actionLoadingConsultaId === c.id}
                              onClick={() => void handleResponderConsulta(c.id, "no_disponible")}
                              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">
                              No hay disponibilidad
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Detalle consulta */}
            {consultaSeleccionada && (
              <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
                <div className="mb-4 flex items-start justify-between">
                  <h2 className="text-base font-semibold text-zinc-900">Detalle consulta #{consultaSeleccionada.id}</h2>
                  <button type="button" onClick={() => setConsultaSeleccionada(null)}
                    className="text-xs text-zinc-500 hover:text-zinc-800 underline">Cerrar</button>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs md:grid-cols-3 lg:grid-cols-4">
                  {([
                    ["Cliente", clienteNombre(consultaSeleccionada.cliente_id)],
                    ["Fecha solicitud", fmt(consultaSeleccionada.creado_en, true)],
                    ["Tipo de viaje", consultaSeleccionada.tipo_viaje],
                    ["Fecha viaje", fmt(consultaSeleccionada.fecha_viaje)],
                    ["Hora", consultaSeleccionada.hora_viaje],
                    ["Origen", dir(consultaSeleccionada.origen_calle, consultaSeleccionada.origen_altura, consultaSeleccionada.origen_localidad)],
                    ["Destino", dir(consultaSeleccionada.destino_calle, consultaSeleccionada.destino_altura, consultaSeleccionada.destino_localidad)],
                    ["Pasajero", consultaSeleccionada.pasajero_nombre],
                    ["Teléfono", consultaSeleccionada.pasajero_telefono],
                    ["Cantidad pasajeros", consultaSeleccionada.pasajero_cantidad?.toString()],
                    ["ID Viaje", consultaSeleccionada.id_viaje],
                    ["Ida y vuelta", consultaSeleccionada.ida_y_vuelta ? "Sí" : "No"],
                    ["Con espera", consultaSeleccionada.con_espera ? "Sí" : "No"],
                    ["Recurrente", consultaSeleccionada.es_recurrente ? "Sí" : "No"],
                    ["Días recurrente", consultaSeleccionada.dias_recurrente?.join(", ")],
                    ["Hora recurrente", consultaSeleccionada.hora_recurrente],
                    ["Inicio recurrente", fmt(consultaSeleccionada.fecha_inicio_recurrente)],
                    ["Fin recurrente", fmt(consultaSeleccionada.fecha_fin_recurrente)],
                    ["Centro de costos", consultaSeleccionada.centro_costos],
                    ["Solicitado por", consultaSeleccionada.solicitado_por],
                    ["Mail solicitante", consultaSeleccionada.mail_solicitante],
                    ["Notas", notasText(consultaSeleccionada.notas)],
                  ] as [string, string | null | undefined][]).map(([label, value]) => (
                    <div key={label}>
                      <span className="font-medium text-zinc-500">{label}: </span>
                      <span className="text-zinc-800">{value ?? "-"}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    placeholder="Respuesta para el solicitante (opcional)"
                    value={respuestaTexto[consultaSeleccionada.id] ?? ""}
                    onChange={(e) => setRespuestaTexto((prev) => ({ ...prev, [consultaSeleccionada.id]: e.target.value }))}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-xs shadow-sm focus:border-zinc-900 focus:outline-none sm:w-72"
                  />
                  <button type="button" disabled={actionLoadingConsultaId === consultaSeleccionada.id}
                    onClick={() => void handleResponderConsulta(consultaSeleccionada.id, "disponible")}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                    Hay disponibilidad
                  </button>
                  <button type="button" disabled={actionLoadingConsultaId === consultaSeleccionada.id}
                    onClick={() => void handleResponderConsulta(consultaSeleccionada.id, "no_disponible")}
                    className="rounded-md bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">
                    No hay disponibilidad
                  </button>
                </div>
              </div>
            )}
          </>
        ) : activeTab === "reservas" ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="text-sm text-zinc-600">Reservas pendientes de confirmación. Hacé click en una fila para ver el detalle.</p>
              <button type="button" onClick={() => void fetchReservas()}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                Actualizar
              </button>
            </div>

            {error && <p className="mb-3 text-sm text-red-600" role="alert">{error}</p>}

            {loading ? (
              <p className="text-sm text-zinc-600">Cargando reservas...</p>
            ) : reservas.length === 0 ? (
              <p className="text-sm text-zinc-600">No hay reservas pendientes de confirmación.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Fecha solicitud</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Fecha viaje</th>
                      <th className="px-3 py-2">Hora</th>
                      <th className="px-3 py-2">Origen</th>
                      <th className="px-3 py-2">Destino</th>
                      <th className="px-3 py-2">Pasajero</th>
                      <th className="px-3 py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservas.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => void abrirModal(r)}
                        className={`cursor-pointer border-b border-zinc-100 hover:bg-blue-50 ${reservaSeleccionada?.id === r.id ? "bg-blue-50" : ""}`}
                      >
                        <td className="px-3 py-2 text-xs text-zinc-600">{fmt(r.creado_en, true)}</td>
                        <td className="px-3 py-2 text-xs font-medium text-zinc-800">{clienteNombre(r.cliente_id)}</td>
                        <td className="px-3 py-2 text-xs text-zinc-700">{fmt(r.fecha_viaje)}</td>
                        <td className="px-3 py-2 text-xs text-zinc-700">{r.hora_viaje ?? "-"}</td>
                        <td className="px-3 py-2 text-xs text-zinc-700">{dir(r.origen_calle, r.origen_altura, r.origen_localidad)}</td>
                        <td className="px-3 py-2 text-xs text-zinc-700">{dir(r.destino_calle, r.destino_altura, r.destino_localidad)}</td>
                        <td className="px-3 py-2 text-xs text-zinc-700">{r.pasajero_nombre ?? "-"}</td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={actionLoadingId === r.id}
                              onClick={() => { void abrirModal(r); }}
                              className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                              Ver / Confirmar
                            </button>
                            <button type="button" disabled={actionLoadingId === r.id}
                              onClick={() => void handleRechazar(r.id)}
                              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">
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

            {/* Panel de detalle */}
            {reservaSeleccionada && (
              <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
                <div className="mb-4 flex items-start justify-between">
                  <h2 className="text-base font-semibold text-zinc-900">
                    Detalle reserva #{reservaSeleccionada.id}
                  </h2>
                  <button type="button" onClick={() => setReservaSeleccionada(null)}
                    className="text-xs text-zinc-500 hover:text-zinc-800 underline">
                    Cerrar
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs md:grid-cols-3 lg:grid-cols-4">
                  {[
                    ["Cliente", clienteNombre(reservaSeleccionada.cliente_id)],
                    ["Fecha solicitud", fmt(reservaSeleccionada.creado_en, true)],
                    ["ID Viaje", reservaSeleccionada.id_viaje],
                    ["Tipo de viaje", reservaSeleccionada.tipo_viaje],
                    ["Fecha viaje", fmt(reservaSeleccionada.fecha_viaje)],
                    ["Hora", reservaSeleccionada.hora_viaje],
                    ["Origen", dir(reservaSeleccionada.origen_calle, reservaSeleccionada.origen_altura, reservaSeleccionada.origen_localidad)],
                    ["Destino", dir(reservaSeleccionada.destino_calle, reservaSeleccionada.destino_altura, reservaSeleccionada.destino_localidad)],
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
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span className="font-medium text-zinc-500">{label}: </span>
                      <span className="text-zinc-800">{value ?? "-"}</span>
                    </div>
                  ))}
                </div>

                {/* Paradas */}
                <div className="mt-4">
                  <h3 className="mb-2 text-xs font-semibold text-zinc-700">Paradas intermedias</h3>
                  {loadingParadas ? (
                    <p className="text-xs text-zinc-500">Cargando paradas...</p>
                  ) : paradasModal.length === 0 ? (
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
                        {paradasModal.map((p, i) => (
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

                {/* Campos de confirmación */}
                <div className="mt-5 space-y-3 border-t border-zinc-200 pt-4">
                  <h3 className="text-xs font-semibold text-zinc-700">Datos de confirmación</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700">
                        Número de reserva <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={modalNumeroReserva}
                        onChange={(e) => setModalNumeroReserva(e.target.value)}
                        placeholder="Ej: 2025-0045"
                        className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700">Chofer (opcional)</label>
                      <input
                        type="text"
                        value={modalChofer}
                        onChange={(e) => setModalChofer(e.target.value)}
                        placeholder="Nombre del chofer"
                        className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      />
                    </div>
                  </div>

                  {/* Archivo adjunto */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Archivo adjunto (opcional)</label>
                    {modalArchivoUrl ? (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-700">{modalArchivoNombre ?? "Archivo cargado"}</span>
                        <a href={modalArchivoUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-medium text-blue-600 underline hover:text-blue-800">
                          Ver archivo
                        </a>
                        <button type="button"
                          onClick={() => { setModalArchivoUrl(null); setModalArchivoNombre(null); }}
                          className="text-xs text-red-500 underline hover:text-red-700">
                          Quitar
                        </button>
                      </div>
                    ) : (
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                        {uploadingArchivo ? "Subiendo..." : "Seleccionar archivo"}
                        <input
                          type="file"
                          className="hidden"
                          disabled={uploadingArchivo}
                          onChange={(e) => void handleUploadArchivo(e)}
                        />
                      </label>
                    )}
                  </div>

                  {modalError && (
                    <p className="text-xs font-medium text-red-600">{modalError}</p>
                  )}

                  {/* Popup sin archivo */}
                  {showConfirmSinArchivo && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                      <p className="mb-2 text-xs font-medium text-amber-800">
                        No hay archivo adjunto. ¿Deseás confirmar igualmente?
                      </p>
                      <div className="flex gap-2">
                        <button type="button"
                          disabled={actionLoadingId === reservaSeleccionada.id}
                          onClick={() => void handleConfirmar(true)}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                          {actionLoadingId === reservaSeleccionada.id ? "Procesando..." : "Sí, confirmar"}
                        </button>
                        <button type="button"
                          onClick={() => setShowConfirmSinArchivo(false)}
                          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button type="button"
                      disabled={actionLoadingId === reservaSeleccionada.id || uploadingArchivo}
                      onClick={() => void handleConfirmar(false)}
                      className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                      {actionLoadingId === reservaSeleccionada.id ? "Procesando..." : "Confirmar reserva"}
                    </button>
                    <button type="button"
                      disabled={actionLoadingId === reservaSeleccionada.id}
                      onClick={() => void handleRechazar(reservaSeleccionada.id)}
                      className="rounded-md bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">
                      Rechazar reserva
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* clientes tab */}
            {clientesError && <p className="mb-3 text-sm text-red-600" role="alert">{clientesError}</p>}

            <div className="grid gap-6 md:grid-cols-2">
              <section className="space-y-3 rounded-lg border border-zinc-200 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-900">
                    {editandoClienteId ? "Editar cliente" : "Crear nuevo cliente"}
                  </h2>
                  {editandoClienteId && (
                    <button type="button" onClick={resetFormCliente}
                      className="text-xs text-zinc-500 underline hover:text-zinc-800">
                      Cancelar edición
                    </button>
                  )}
                </div>
                <form onSubmit={handleGuardarCliente} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Nombre</label>
                    <input type="text" value={nuevoClienteNombre}
                      onChange={(e) => setNuevoClienteNombre(e.target.value)}
                      className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900" />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-zinc-700">Campos obligatorios para este cliente</p>
                    <div className="space-y-2">
                      {CAMPOS_CONFIG.map((campo) => (
                        <label key={campo.key} className="flex cursor-pointer items-center gap-2">
                          <input type="checkbox" checked={!!checkboxConfig[campo.key]}
                            onChange={(e) => setCheckboxConfig((prev) => ({ ...prev, [campo.key]: e.target.checked }))}
                            className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900" />
                          <span className="text-xs text-zinc-700">{campo.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <button type="submit" disabled={savingCliente}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60">
                    {savingCliente ? "Guardando..." : editandoClienteId ? "Guardar cambios" : "Crear cliente"}
                  </button>
                </form>
              </section>

              <section className="space-y-3 rounded-lg border border-zinc-200 p-4">
                <h2 className="text-sm font-semibold text-zinc-900">Clientes existentes</h2>
                {clientesLoading ? (
                  <p className="text-xs text-zinc-600">Cargando clientes...</p>
                ) : clientes.length === 0 ? (
                  <p className="text-xs text-zinc-600">No hay clientes cargados.</p>
                ) : (
                  <div className="max-h-60 overflow-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase text-zinc-500">
                        <tr>
                          <th className="px-2 py-1">Nombre</th>
                          <th className="px-2 py-1">Campos obligatorios</th>
                          <th className="px-2 py-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientes.map((cliente) => {
                          const cfg = (cliente.configuracion_campos ?? {}) as Record<string, boolean>;
                          const activos = CAMPOS_CONFIG.filter((c) => cfg[c.key]).map((c) => c.label);
                          return (
                            <tr key={cliente.id}
                              className={`border-b border-zinc-100 ${editandoClienteId === cliente.id ? "bg-zinc-50" : ""}`}>
                              <td className="px-2 py-1 text-[11px] text-zinc-800">{cliente.nombre ?? "-"}</td>
                              <td className="px-2 py-1 text-[10px] text-zinc-600">{activos.length > 0 ? activos.join(", ") : "Ninguno"}</td>
                              <td className="px-2 py-1">
                                <button type="button" onClick={() => handleEditarCliente(cliente)}
                                  className="text-[10px] font-medium text-zinc-600 underline hover:text-zinc-900">
                                  Editar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            <section className="mt-6 space-y-3 rounded-lg border border-zinc-200 p-4">
              <h2 className="text-sm font-semibold text-zinc-900">Asignar cliente a usuarios</h2>
              {clientesLoading ? (
                <p className="text-xs text-zinc-600">Cargando usuarios...</p>
              ) : usuarios.length === 0 ? (
                <p className="text-xs text-zinc-600">No hay usuarios cargados.</p>
              ) : (
                <div className="max-h-72 overflow-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase text-zinc-500">
                      <tr>
                        <th className="px-2 py-1">Usuario</th>
                        <th className="px-2 py-1">Cliente asignado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usuarios.map((usuario) => (
                        <tr key={usuario.id} className="border-b border-zinc-100">
                          <td className="px-2 py-1 text-[11px] text-zinc-800">{usuario.email}</td>
                          <td className="px-2 py-1">
                            <select
                              className="w-full rounded-md border border-zinc-300 px-2 py-1 text-[11px] shadow-sm focus:border-zinc-900 focus:outline-none"
                              value={usuario.cliente_id ?? ""}
                              onChange={(e) => void handleAsignarCliente(usuario.id, e.target.value || null)}
                              disabled={savingAsignacionId === usuario.id}>
                              <option value="">Sin cliente</option>
                              {clientes.map((c) => (
                                <option key={c.id} value={c.id}>{c.nombre || c.id}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
