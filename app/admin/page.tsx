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
  const [activeTab, setActiveTab] = useState<"reservas" | "clientes">("reservas");

  // Modal detalle
  const [reservaSeleccionada, setReservaSeleccionada] = useState<Reserva | null>(null);
  const [paradasModal, setParadasModal] = useState<Parada[]>([]);
  const [loadingParadas, setLoadingParadas] = useState(false);

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
      await fetchClientesYUsuarios();
    };
    void checkAuthAndFetch();
  }, [router]);

  const abrirModal = async (reserva: Reserva) => {
    setReservaSeleccionada(reserva);
    setParadasModal([]);
    setLoadingParadas(true);
    const { data } = await supabase.from("paradas")
      .select("id, calle, altura, localidad, pasajero_nombre, pasajero_telefono")
      .eq("reserva_id", reserva.id);
    setParadasModal((data ?? []) as Parada[]);
    setLoadingParadas(false);
  };

  const handleAccion = async (id: number, nuevoEstado: "confirmada" | "rechazada") => {
    setActionLoadingId(id);
    setError(null);
    if (nuevoEstado === "confirmada") {
      const response = await fetch("/api/confirmar-reserva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservaId: id }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data?.error ?? "Error al confirmar. Intentá nuevamente.");
      } else {
        setReservas((prev) => prev.filter((r) => r.id !== id));
        if (reservaSeleccionada?.id === id) setReservaSeleccionada(null);
      }
    } else {
      const { error: updateError } = await supabase.from("reservas")
        .update({ estado: nuevoEstado }).eq("id", id);
      if (updateError) { setError(updateError.message); }
      else {
        setReservas((prev) => prev.filter((r) => r.id !== id));
        if (reservaSeleccionada?.id === id) setReservaSeleccionada(null);
      }
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
          {(["reservas", "clientes"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-t-md px-4 py-2 text-xs font-medium ${
                activeTab === tab
                  ? "border border-b-white border-zinc-200 bg-white text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {tab === "reservas" ? "Reservas a confirmar" : "Gestión de Clientes"}
            </button>
          ))}
        </div>

        {activeTab === "reservas" ? (
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
                      <th className="px-3 py-2">Notas</th>
                      <th className="px-3 py-2">Mail solicitante</th>
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
                        <td className="max-w-[140px] truncate px-3 py-2 text-xs text-zinc-600">{notasText(r.notas)}</td>
                        <td className="px-3 py-2 text-xs text-zinc-600">{r.mail_solicitante ?? "-"}</td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={actionLoadingId === r.id}
                              onClick={() => void handleAccion(r.id, "confirmada")}
                              className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                              {actionLoadingId === r.id ? "..." : "Confirmar"}
                            </button>
                            <button type="button" disabled={actionLoadingId === r.id}
                              onClick={() => void handleAccion(r.id, "rechazada")}
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

                <div className="mt-4 flex gap-2">
                  <button type="button" disabled={actionLoadingId === reservaSeleccionada.id}
                    onClick={() => void handleAccion(reservaSeleccionada.id, "confirmada")}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                    {actionLoadingId === reservaSeleccionada.id ? "Procesando..." : "Confirmar reserva"}
                  </button>
                  <button type="button" disabled={actionLoadingId === reservaSeleccionada.id}
                    onClick={() => void handleAccion(reservaSeleccionada.id, "rechazada")}
                    className="rounded-md bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">
                    Rechazar reserva
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
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
