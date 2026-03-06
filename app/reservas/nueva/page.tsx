"use client";

import { useFieldArray, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type TipoViaje = "pasajero" | "mensajeria";

type ParadaIntermedia = {
  calle: string;
  altura: string;
  localidad: string;
  observaciones?: string;
  pasajeroNombre?: string;
  pasajeroCantidad?: number;
  pasajeroTelefono?: string;
};

type ReservaFormValues = {
  idViaje: string;
  tipoViaje: TipoViaje;
  fechaViaje: string;
  horaViaje: string;

  origenCalle: string;
  origenAltura: string;
  origenLocalidad: string;
  origenObservaciones?: string;

  destinoCalle: string;
  destinoAltura: string;
  destinoLocalidad: string;
  destinoObservaciones?: string;

  pasajeroNombre: string;
  pasajeroCantidad: number;
  pasajeroTelefono: string;

  paradas: ParadaIntermedia[];

  conEspera: "SI" | "NO";
  idaYVuelta: "SI" | "NO";

  esRecurrente: "SI" | "NO";
  diasRecurrente?: string[];
  horaRecurrente?: string;
  fechaInicioRecurrente?: string;
  fechaFinRecurrente?: string;

  centroCostos: string;
  solicitadoPor: string;
  notas?: string;
};

export default function NuevaReservaPage() {
  const router = useRouter();
  const [configError, setConfigError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [camposConfig, setCamposConfig] = useState<{
    id_viaje?: boolean;
    centro_costos?: boolean;
    solicitado_por?: boolean;
  } | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<ReservaFormValues>({
    defaultValues: {
      tipoViaje: "pasajero",
      conEspera: "NO",
      idaYVuelta: "NO",
      esRecurrente: "NO",
      paradas: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "paradas",
  });

  const watchEsRecurrente = watch("esRecurrente");

  // Cargar configuración de campos obligatorios por cliente
  useEffect(() => {
    const cargarConfiguracion = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.email) {
          return;
        }

        const { data: usuario, error: usuarioError } = await supabase
          .from("usuarios")
          .select("cliente_id")
          .eq("email", session.user.email)
          .maybeSingle();

        if (usuarioError) {
          setConfigError(usuarioError.message);
          return;
        }

        if (!usuario?.cliente_id) {
          return;
        }

        const { data: cliente, error: clienteError } = await supabase
          .from("clientes")
          .select("configuracion_campos")
          .eq("id", usuario.cliente_id)
          .maybeSingle();

        if (clienteError) {
          setConfigError(clienteError.message);
          return;
        }

        if (cliente?.configuracion_campos) {
          setCamposConfig(
            cliente.configuracion_campos as {
              id_viaje?: boolean;
              centro_costos?: boolean;
              solicitado_por?: boolean;
            },
          );
        }
      } catch (e: any) {
        setConfigError(
          e?.message ??
            "No se pudo cargar la configuración de campos del cliente.",
        );
      }
    };

    void cargarConfiguracion();
  }, []);

  const requeridoIdViaje = !!camposConfig?.id_viaje;
  const requeridoCentroCostos = !!camposConfig?.centro_costos;
  const requeridoSolicitadoPor = !!camposConfig?.solicitado_por;

  const onSubmit = async (data: ReservaFormValues) => {
    setError(null);
    setSuccessMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // Obtener cliente_id del usuario logueado
      let clienteId: string | null = null;
      if (session?.user?.id) {
        const { data: usuarioData } = await supabase
          .from("usuarios")
          .select("cliente_id")
          .eq("id", session.user.id)
          .maybeSingle();
        clienteId = usuarioData?.cliente_id ?? null;
      }

      const baseReserva = {
        id_viaje: data.idViaje,
        usuario_id: session?.user?.id ?? null,
        cliente_id: clienteId,
        tipo_viaje: data.tipoViaje,
        fecha_viaje: data.fechaViaje,
        hora_viaje: data.horaViaje,
        origen_calle: data.origenCalle,
        origen_altura: data.origenAltura,
        origen_localidad: data.origenLocalidad,
        origen_observaciones: data.origenObservaciones || null,
        destino_calle: data.destinoCalle,
        destino_altura: data.destinoAltura,
        destino_localidad: data.destinoLocalidad,
        destino_observaciones: data.destinoObservaciones || null,
        pasajero_nombre: data.pasajeroNombre,
        pasajero_cantidad: data.pasajeroCantidad,
        pasajero_telefono: data.pasajeroTelefono,
        con_espera: data.conEspera === "SI",
        ida_y_vuelta: data.idaYVuelta === "SI",
        es_recurrente: data.esRecurrente === "SI",
        dias_recurrente: data.diasRecurrente ?? null,
        hora_recurrente: data.horaRecurrente ?? null,
        fecha_inicio_recurrente: data.fechaInicioRecurrente ?? null,
        fecha_fin_recurrente: data.fechaFinRecurrente ?? null,
        centro_costos: data.centroCostos,
        solicitado_por: data.solicitadoPor,
        mail_solicitante: session?.user?.email ?? null,
        notas: data.notas || null,
        estado: "a_confirmar",
        creado_en: new Date().toISOString(),
      };

      // Regla de negocio indicada:
      // - Ida y vuelta CON espera -> 1 reserva
      // - Ida y vuelta SIN espera -> 2 reservas (ida y vuelta separadas)
      const reservasAInsertar: typeof baseReserva[] = [];

      if (data.idaYVuelta === "SI" && data.conEspera === "NO") {
        reservasAInsertar.push(baseReserva, baseReserva);
      } else {
        reservasAInsertar.push(baseReserva);
      }

      const { data: reservasInsertadas, error: reservasError } =
        await supabase.from("reservas").insert(reservasAInsertar).select("id");

      if (reservasError) {
        throw reservasError;
      }

      if (data.paradas && data.paradas.length > 0 && reservasInsertadas) {
        const paradasPayload = data.paradas.flatMap((parada) =>
          reservasInsertadas.map((reserva) => ({
            reserva_id: reserva.id,
            calle: parada.calle,
            altura: parada.altura,
            localidad: parada.localidad,
            pasajero_nombre: parada.pasajeroNombre || null,
            pasajero_telefono: parada.pasajeroTelefono || null,
          })),
        );

        const { error: paradasError } = await supabase
          .from("paradas")
          .insert(paradasPayload);

        if (paradasError) {
          throw paradasError;
        }
      }

      setSuccessMessage("Reserva creada correctamente y enviada a confirmar.");
      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (e: any) {
      setError(e.message ?? "Ocurrió un error al crear la reserva.");
    }
  };

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <div className="mx-auto my-8 w-full max-w-5xl rounded-xl bg-white p-8 shadow">
        <h1 className="mb-2 text-2xl font-semibold text-zinc-900">
          Nueva reserva
        </h1>
        <p className="mb-6 text-sm text-zinc-600">
          Completá los datos del viaje para solicitar un nuevo remis.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Datos básicos */}
          <section className="grid gap-4 rounded-lg border border-zinc-200 p-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <h2 className="text-sm font-semibold text-zinc-900">
                Datos del viaje
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Identificación y tipo de servicio.
              </p>
            </div>
            <div className="space-y-4 md:col-span-2">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Tipo de viaje
                  </label>
                  <select
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("tipoViaje", { required: true })}
                  >
                    <option value="pasajero">Pasajero</option>
                    <option value="mensajeria">Mensajería</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Fecha del viaje
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("fechaViaje", {
                      required: "La fecha del viaje es obligatoria",
                      validate: (value) => {
                        if (!value) return true;
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const selected = new Date(value + "T00:00:00");
                        return selected >= today || "La fecha del viaje no puede ser anterior a hoy";
                      },
                    })}
                  />
                  {errors.fechaViaje && (
                    <p className="mt-1 text-xs text-red-600">{errors.fechaViaje.message}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Hora del viaje
                  </label>
                  <input
                    type="time"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("horaViaje", { required: true })}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Origen y destino */}
          <section className="grid gap-4 rounded-lg border border-zinc-200 p-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <h2 className="text-sm font-semibold text-zinc-900">
                Origen y destino
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Dirección de inicio y finalización del viaje.
              </p>
            </div>
            <div className="space-y-6 md:col-span-2">
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Origen
                </h3>
                <div className="grid gap-3 md:grid-cols-4">
                  <input
                    placeholder="Calle"
                    className="md:col-span-2 rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("origenCalle", { required: true })}
                  />
                  <input
                    placeholder="Altura"
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("origenAltura", { required: true })}
                  />
                  <input
                    placeholder="Localidad"
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("origenLocalidad", { required: true })}
                  />
                </div>
                <textarea
                  placeholder="Observaciones (punto de encuentro, referencia, etc.)"
                  className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  rows={2}
                  {...register("origenObservaciones")}
                />
              </div>

              <div className="h-px w-full bg-zinc-100" />

              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Destino
                </h3>
                <div className="grid gap-3 md:grid-cols-4">
                  <input
                    placeholder="Calle"
                    className="md:col-span-2 rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("destinoCalle", { required: true })}
                  />
                  <input
                    placeholder="Altura"
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("destinoAltura", { required: true })}
                  />
                  <input
                    placeholder="Localidad"
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("destinoLocalidad", { required: true })}
                  />
                </div>
                <textarea
                  placeholder="Observaciones"
                  className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  rows={2}
                  {...register("destinoObservaciones")}
                />
              </div>
            </div>
          </section>

          {/* Pasajero */}
          <section className="grid gap-4 rounded-lg border border-zinc-200 p-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <h2 className="text-sm font-semibold text-zinc-900">Pasajero</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Datos de contacto y cantidad de pasajeros.
              </p>
            </div>
            <div className="space-y-4 md:col-span-2">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Nombre del pasajero
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("pasajeroNombre", { required: true })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Cantidad
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("pasajeroCantidad", {
                      valueAsNumber: true,
                      required: true,
                      min: 1,
                    })}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Teléfono de contacto
                </label>
                <input
                  type="tel"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  {...register("pasajeroTelefono", { required: true })}
                />
              </div>
            </div>
          </section>

          {/* Paradas intermedias */}
          <section className="grid gap-4 rounded-lg border border-zinc-200 p-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <h2 className="text-sm font-semibold text-zinc-900">
                Paradas intermedias
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Agregá una o más paradas con su dirección y pasajero.
              </p>
            </div>
            <div className="space-y-4 md:col-span-2">
              {fields.length === 0 && (
                <p className="text-xs text-zinc-500">
                  No hay paradas cargadas. Podés agregar las que necesites.
                </p>
              )}

              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="space-y-3 rounded-lg border border-zinc-200 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Parada {index + 1}
                    </h3>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Quitar
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <input
                      placeholder="Calle"
                      className="md:col-span-2 rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      {...register(`paradas.${index}.calle` as const, {
                        required: true,
                      })}
                    />
                    <input
                      placeholder="Altura"
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      {...register(`paradas.${index}.altura` as const, {
                        required: true,
                      })}
                    />
                    <input
                      placeholder="Localidad"
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      {...register(`paradas.${index}.localidad` as const, {
                        required: true,
                      })}
                    />
                  </div>

                  <textarea
                    placeholder="Observaciones"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    rows={2}
                    {...register(`paradas.${index}.observaciones` as const)}
                  />

                  <div className="grid gap-3 md:grid-cols-3">
                    <input
                      placeholder="Nombre pasajero"
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      {...register(
                        `paradas.${index}.pasajeroNombre` as const,
                      )}
                    />
                    <input
                      type="number"
                      min={1}
                      placeholder="Cantidad"
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      {...register(
                        `paradas.${index}.pasajeroCantidad` as const,
                        { valueAsNumber: true },
                      )}
                    />
                    <input
                      placeholder="Teléfono"
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      {...register(
                        `paradas.${index}.pasajeroTelefono` as const,
                      )}
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  append({
                    calle: "",
                    altura: "",
                    localidad: "",
                  })
                }
                className="rounded-md border border-dashed border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:border-zinc-500 hover:bg-zinc-50"
              >
                + Agregar parada intermedia
              </button>
            </div>
          </section>

          {/* Opciones de viaje */}
          <section className="grid gap-4 rounded-lg border border-zinc-200 p-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <h2 className="text-sm font-semibold text-zinc-900">
                Opciones de viaje
              </h2>
            </div>
            <div className="space-y-4 md:col-span-2">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Con espera
                  </label>
                  <select
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("conEspera", { required: true })}
                  >
                    <option value="SI">Sí</option>
                    <option value="NO">No</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Ida y vuelta
                  </label>
                  <select
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("idaYVuelta", { required: true })}
                  >
                    <option value="SI">Sí</option>
                    <option value="NO">No</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Es recurrente
                  </label>
                  <select
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("esRecurrente", { required: true })}
                  >
                    <option value="NO">No</option>
                    <option value="SI">Sí</option>
                  </select>
                </div>
              </div>

              {watchEsRecurrente === "SI" && (
                <div className="mt-2 space-y-3 rounded-md bg-zinc-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Configuración de recurrencia
                  </p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <span className="block text-xs font-medium text-zinc-700">
                        Días de la semana
                      </span>
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        {[
                          "Lunes",
                          "Martes",
                          "Miércoles",
                          "Jueves",
                          "Viernes",
                          "Sábado",
                          "Domingo",
                        ].map((dia) => (
                          <label
                            key={dia}
                            className="flex items-center gap-1 rounded border border-zinc-200 bg-white px-1.5 py-0.5"
                          >
                            <input
                              type="checkbox"
                              value={dia}
                              className="h-3 w-3"
                              {...register("diasRecurrente")}
                            />
                            <span className="truncate">{dia}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700">
                        Hora
                      </label>
                      <input
                        type="time"
                        className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                        {...register("horaRecurrente")}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-700">
                          Fecha inicio
                        </label>
                        <input
                          type="date"
                          className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                          {...register("fechaInicioRecurrente")}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-700">
                          Fecha fin
                        </label>
                        <input
                          type="date"
                          className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                          {...register("fechaFinRecurrente")}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Centro de costos y solicitante */}
          <section className="grid gap-4 rounded-lg border border-zinc-200 p-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <h2 className="text-sm font-semibold text-zinc-900">
                Datos administrativos
              </h2>
            </div>
            <div className="space-y-4 md:col-span-2">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    ID Viaje
                    {requeridoIdViaje && (
                      <span className="ml-0.5 text-red-600">*</span>
                    )}
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("idViaje", { required: requeridoIdViaje })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Centro de costos
                    {requeridoCentroCostos && (
                      <span className="ml-0.5 text-red-600">*</span>
                    )}
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("centroCostos", {
                      required: requeridoCentroCostos,
                    })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Solicitado por
                    {requeridoSolicitadoPor && (
                      <span className="ml-0.5 text-red-600">*</span>
                    )}
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    {...register("solicitadoPor", {
                      required: requeridoSolicitadoPor,
                    })}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Notas
                </label>
                <textarea
                  rows={3}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="Información adicional para el operador o el chofer."
                  {...register("notas")}
                />
              </div>
            </div>
          </section>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          {successMessage && (
            <p className="text-sm text-emerald-600" role="status">
              {successMessage}
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Enviando..." : "Enviar a confirmar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

