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

export default function AdminPage() {
  const router = useRouter();
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"reservas" | "clientes">(
    "reservas",
  );

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [clientesLoading, setClientesLoading] = useState(false);
  const [clientesError, setClientesError] = useState<string | null>(null);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [nuevoClienteConfig, setNuevoClienteConfig] = useState<string>("{}");
  const [savingCliente, setSavingCliente] = useState(false);
  const [savingAsignacionId, setSavingAsignacionId] = useState<string | null>(
    null,
  );

  const fetchReservas = async () => {
    setLoading(true);
    setError(null);
    const { data, error: reservasError } = await supabase
      .from("reservas")
      .select("*")
      .eq("estado", "a_confirmar")
      .order("created_at", { ascending: false });

    if (reservasError) {
      setError(reservasError.message);
      setReservas([]);
    } else {
      setReservas(data as Reserva[]);
    }
    setLoading(false);
  };

  const fetchClientesYUsuarios = async () => {
    setClientesLoading(true);
    setClientesError(null);

    const { data: clientesData, error: clientesErr } = await supabase
      .from("clientes")
      .select("id, nombre, configuracion_campos");

    const { data: usuariosData, error: usuariosErr } = await supabase
      .from("usuarios")
      .select("id, email, cliente_id");

    if (clientesErr || usuariosErr) {
      setClientesError(
        clientesErr?.message ??
          usuariosErr?.message ??
          "No se pudieron cargar clientes/usuarios.",
      );
      setClientes([]);
      setUsuarios([]);
    } else {
      setClientes((clientesData ?? []) as Cliente[]);
      setUsuarios((usuariosData ?? []) as Usuario[]);
    }

    setClientesLoading(false);
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
      await fetchClientesYUsuarios();
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

  const handleCrearCliente = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setSavingCliente(true);
    setClientesError(null);

    try {
      let parsedConfig: unknown = {};
      if (nuevoClienteConfig.trim()) {
        parsedConfig = JSON.parse(nuevoClienteConfig);
      }

      const { error: insertError } = await supabase.from("clientes").insert({
        nombre: nuevoClienteNombre || null,
        configuracion_campos: parsedConfig,
      });

      if (insertError) {
        setClientesError(insertError.message);
      } else {
        setNuevoClienteNombre("");
        setNuevoClienteConfig("{}");
        await fetchClientesYUsuarios();
      }
    } catch (e: any) {
      setClientesError(
        e?.message ?? "Error al crear el cliente. Verificá el JSON.",
      );
    } finally {
      setSavingCliente(false);
    }
  };

  const handleAsignarCliente = async (
    usuarioId: string,
    clienteId: string | null,
  ) => {
    setSavingAsignacionId(usuarioId);
    setClientesError(null);

    const { error: updateError } = await supabase
      .from("usuarios")
      .update({ cliente_id: clienteId })
      .eq("id", usuarioId);

    if (updateError) {
      setClientesError(updateError.message);
    } else {
      await fetchClientesYUsuarios();
    }

    setSavingAsignacionId(null);
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
              Gestión de reservas y clientes.
            </p>
          </div>
        </div>

        <div className="mb-4 flex gap-2 border-b border-zinc-200">
          <button
            type="button"
            onClick={() => setActiveTab("reservas")}
            className={`rounded-t-md px-4 py-2 text-xs font-medium ${
              activeTab === "reservas"
                ? "border border-b-white border-zinc-200 bg-white text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Reservas a confirmar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("clientes")}
            className={`rounded-t-md px-4 py-2 text-xs font-medium ${
              activeTab === "clientes"
                ? "border border-b-white border-zinc-200 bg-white text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Gestión de Clientes
          </button>
        </div>

        {activeTab === "reservas" ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="text-sm text-zinc-600">
                Reservas pendientes de confirmación.
              </p>
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
          </>
        ) : (
          <>
            {clientesError && (
              <p className="mb-3 text-sm text-red-600" role="alert">
                {clientesError}
              </p>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <section className="space-y-3 rounded-lg border border-zinc-200 p-4">
                <h2 className="text-sm font-semibold text-zinc-900">
                  Crear nuevo cliente
                </h2>
                <form onSubmit={handleCrearCliente} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">
                      Nombre
                    </label>
                    <input
                      type="text"
                      value={nuevoClienteNombre}
                      onChange={(e) => setNuevoClienteNombre(e.target.value)}
                      className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">
                      configuración_campos (JSON)
                    </label>
                    <textarea
                      rows={4}
                      value={nuevoClienteConfig}
                      onChange={(e) => setNuevoClienteConfig(e.target.value)}
                      className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-mono shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingCliente}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingCliente ? "Guardando..." : "Crear cliente"}
                  </button>
                </form>
              </section>

              <section className="space-y-3 rounded-lg border border-zinc-200 p-4">
                <h2 className="text-sm font-semibold text-zinc-900">
                  Clientes existentes
                </h2>
                {clientesLoading ? (
                  <p className="text-xs text-zinc-600">Cargando clientes...</p>
                ) : clientes.length === 0 ? (
                  <p className="text-xs text-zinc-600">
                    No hay clientes cargados.
                  </p>
                ) : (
                  <div className="max-h-60 overflow-auto text-xs">
                    <table className="min-w-full text-left text-xs">
                      <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase text-zinc-500">
                        <tr>
                          <th className="px-2 py-1">ID</th>
                          <th className="px-2 py-1">Nombre</th>
                          <th className="px-2 py-1">configuracion_campos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientes.map((cliente) => (
                          <tr key={cliente.id} className="border-b border-zinc-100">
                            <td className="px-2 py-1 text-[11px] text-zinc-500">
                              {cliente.id}
                            </td>
                            <td className="px-2 py-1 text-[11px] text-zinc-800">
                              {cliente.nombre}
                            </td>
                            <td className="px-2 py-1 text-[10px] text-zinc-600">
                              {cliente.configuracion_campos
                                ? JSON.stringify(cliente.configuracion_campos)
                                : "{}"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            <section className="mt-6 space-y-3 rounded-lg border border-zinc-200 p-4">
              <h2 className="text-sm font-semibold text-zinc-900">
                Asignar cliente a usuarios
              </h2>
              {clientesLoading ? (
                <p className="text-xs text-zinc-600">Cargando usuarios...</p>
              ) : usuarios.length === 0 ? (
                <p className="text-xs text-zinc-600">
                  No hay usuarios cargados.
                </p>
              ) : (
                <div className="max-h-72 overflow-auto text-xs">
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
                          <td className="px-2 py-1 text-[11px] text-zinc-800">
                            {usuario.email}
                          </td>
                          <td className="px-2 py-1">
                            <select
                              className="w-full rounded-md border border-zinc-300 px-2 py-1 text-[11px] shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                              value={usuario.cliente_id ?? ""}
                              onChange={(e) =>
                                void handleAsignarCliente(
                                  usuario.id,
                                  e.target.value || null,
                                )
                              }
                              disabled={savingAsignacionId === usuario.id}
                            >
                              <option value="">Sin cliente</option>
                              {clientes.map((cliente) => (
                                <option key={cliente.id} value={cliente.id}>
                                  {cliente.nombre || cliente.id}
                                </option>
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

