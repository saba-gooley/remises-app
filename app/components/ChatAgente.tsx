"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Message = { role: "agent" | "user"; text: string };

type ConfigCampos = {
  id_viaje?: boolean;
  centro_costos?: boolean;
  solicitado_por?: boolean;
};

type Parada = {
  calle: string;
  altura: string;
  localidad: string;
  pasajeroNombre?: string;
  pasajeroTelefono?: string;
};

type Answers = {
  tipoViaje?: "pasajero" | "mensajeria";
  fechaViaje?: string;
  horaViaje?: string;
  origenCalle?: string;
  origenAltura?: string;
  origenLocalidad?: string;
  destinoCalle?: string;
  destinoAltura?: string;
  destinoLocalidad?: string;
  pasajeroNombre?: string;
  pasajeroTelefono?: string;
  paradas?: Parada[];
  idaYVuelta?: "SI" | "NO";
  conEspera?: "SI" | "NO";
  esRecurrente?: "SI" | "NO";
  diasRecurrente?: string[];
  horaRecurrente?: string;
  fechaInicioRecurrente?: string;
  fechaFinRecurrente?: string;
  centroCostos?: string;
  idViaje?: string;
  solicitadoPor?: string;
  notas?: string;
};

const SALUDO =
  "¿En qué puedo ayudarte?\n1) Nueva reserva\n2) Consultar mis reservas";

export default function ChatAgente() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [step, setStep] = useState<string>("greeting");
  const [answers, setAnswers] = useState<Answers>({});
  const [paradaIndex, setParadaIndex] = useState(0);
  const [config, setConfig] = useState<ConfigCampos | null>(null);
  const [session, setSession] = useState<{ user: { id: string; email?: string } } | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const addAgent = useCallback((text: string) => {
    setMessages((m) => [...m, { role: "agent", text }]);
  }, []);
  const addUser = useCallback((text: string) => {
    setMessages((m) => [...m, { role: "user", text }]);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (messages.length === 0) {
      addAgent("¡Hola! Soy el agente de reservas.");
      addAgent(SALUDO);
    }
  }, [open, messages.length, addAgent]);

  const loadConfigAndStart = useCallback(async () => {
    setLoading(true);
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    setSession(s ?? null);
    if (!s?.user?.email) {
      addAgent("Necesitás iniciar sesión para crear una reserva.");
      setStep("greeting");
      setLoading(false);
      return;
    }
    const { data: usuario } = await supabase
      .from("usuarios")
      .select("cliente_id")
      .eq("email", s.user.email)
      .maybeSingle();
    if (usuario?.cliente_id) {
      const { data: cliente } = await supabase
        .from("clientes")
        .select("configuracion_campos")
        .eq("id", usuario.cliente_id)
        .maybeSingle();
      if (cliente?.configuracion_campos) {
        setConfig(cliente.configuracion_campos as ConfigCampos);
      }
    }
    setLoading(false);
    setStep("tipo_viaje");
    addAgent("Tipo de viaje: 1) Pasajero  2) Mensajería");
  }, [addAgent]);

  const advanceStep = useCallback(
    (currentStep: string, value: string, newAnswers: Answers) => {
      const next = (): string | null => {
        switch (currentStep) {
          case "tipo_viaje":
            return "fecha_viaje";
          case "fecha_viaje":
            return "hora_viaje";
          case "hora_viaje":
            return "origen_calle";
          case "origen_calle":
            return "origen_altura";
          case "origen_altura":
            return "origen_localidad";
          case "origen_localidad":
            return "destino_calle";
          case "destino_calle":
            return "destino_altura";
          case "destino_altura":
            return "destino_localidad";
          case "destino_localidad":
            return "pasajero_nombre";
          case "pasajero_nombre":
            return "pasajero_telefono";
          case "pasajero_telefono":
            return "paradas_sn";
          case "paradas_sn":
            return value.toUpperCase().startsWith("S") ? "parada_calle" : "ida_y_vuelta";
          case "parada_calle":
            return "parada_altura";
          case "parada_altura":
            return "parada_localidad";
          case "parada_localidad":
            return "parada_pasajero";
          case "parada_pasajero":
            return "parada_telefono";
          case "parada_telefono":
            return "parada_otra";
          case "parada_otra":
            return value.toUpperCase().startsWith("S") ? "parada_calle" : "ida_y_vuelta";
          case "ida_y_vuelta":
            return value.toUpperCase().startsWith("S") ? "con_espera" : "es_recurrente";
          case "con_espera":
            return "es_recurrente";
          case "es_recurrente":
            return value.toUpperCase().startsWith("S")
              ? "dias_recurrente"
              : "centro_costos";
          case "dias_recurrente":
            return "hora_recurrente";
          case "hora_recurrente":
            return "fecha_inicio_recurrente";
          case "fecha_inicio_recurrente":
            return "fecha_fin_recurrente";
          case "fecha_fin_recurrente":
            return "centro_costos";
          case "centro_costos":
            return config?.id_viaje ? "id_viaje" : config?.solicitado_por ? "solicitado_por" : "notas";
          case "id_viaje":
            return config?.solicitado_por ? "solicitado_por" : "notas";
          case "solicitado_por":
            return "notas";
          case "notas":
            return "confirmar";
          default:
            return null;
        }
      };
      let nextStep = next();
      if (currentStep === "centro_costos" && !config?.centro_costos) {
        nextStep = config?.id_viaje ? "id_viaje" : config?.solicitado_por ? "solicitado_por" : "notas";
      }
      if (currentStep === "id_viaje" && !config?.id_viaje) {
        nextStep = config?.solicitado_por ? "solicitado_por" : "notas";
      }
      if (currentStep === "solicitado_por" && !config?.solicitado_por) {
        nextStep = "notas";
      }
      if (nextStep === "parada_calle") {
        setParadaIndex((i) => i + 1);
      }
      if (nextStep) setStep(nextStep);
      return nextStep;
    },
    [config],
  );

  const getNextQuestion = useCallback(
    (nextStep: string): string => {
      switch (nextStep) {
        case "fecha_viaje":
          return "Fecha del viaje (YYYY-MM-DD):";
        case "hora_viaje":
          return "Hora del viaje (HH:MM):";
        case "origen_calle":
          return "Calle de origen:";
        case "origen_altura":
          return "Altura de origen:";
        case "origen_localidad":
          return "Localidad de origen:";
        case "destino_calle":
          return "Calle de destino:";
        case "destino_altura":
          return "Altura de destino:";
        case "destino_localidad":
          return "Localidad de destino:";
        case "pasajero_nombre":
          return "Nombre del pasajero:";
        case "pasajero_telefono":
          return "Teléfono de contacto:";
        case "paradas_sn":
          return "¿Tiene paradas intermedias? (Sí/No)";
        case "parada_calle":
          return "Calle de la parada:";
        case "parada_altura":
          return "Altura de la parada:";
        case "parada_localidad":
          return "Localidad de la parada:";
        case "parada_pasajero":
          return "Nombre del pasajero en la parada:";
        case "parada_telefono":
          return "Teléfono en la parada:";
        case "parada_otra":
          return "¿Agregar otra parada intermedia? (Sí/No)";
        case "ida_y_vuelta":
          return "¿Es ida y vuelta? (Sí/No)";
        case "con_espera":
          return "¿Con espera? (Sí/No)";
        case "es_recurrente":
          return "¿Es recurrente? (Sí/No)";
        case "dias_recurrente":
          return "Días de la semana (ej: Lunes,Martes):";
        case "hora_recurrente":
          return "Hora recurrente (HH:MM):";
        case "fecha_inicio_recurrente":
          return "Fecha inicio recurrencia (YYYY-MM-DD):";
        case "fecha_fin_recurrente":
          return "Fecha fin recurrencia (YYYY-MM-DD):";
        case "centro_costos":
          return "Centro de costos:";
        case "id_viaje":
          return "ID Viaje:";
        case "solicitado_por":
          return "Solicitado por:";
        case "notas":
          return "Notas (opcional, escribí listo para omitir):";
        case "confirmar":
          return buildResumen(answers);
        default:
          return "";
      }
    },
    [answers],
  );

  function buildResumen(a?: Answers): string {
    const x = a ?? answers;
    let t =
      "--- Resumen ---\n" +
      `Tipo: ${x.tipoViaje === "mensajeria" ? "Mensajería" : "Pasajero"}\n` +
      `Fecha: ${x.fechaViaje} ${x.horaViaje}\n` +
      `Origen: ${x.origenCalle} ${x.origenAltura}, ${x.origenLocalidad}\n` +
      `Destino: ${x.destinoCalle} ${x.destinoAltura}, ${x.destinoLocalidad}\n` +
      `Pasajero: ${x.pasajeroNombre} - ${x.pasajeroTelefono}\n`;
    if (x.paradas?.length) {
      t += `Paradas: ${x.paradas.length}\n`;
    }
    t += `Ida y vuelta: ${x.idaYVuelta ?? "No"}`;
    if (x.idaYVuelta === "SI") t += ` - Con espera: ${x.conEspera ?? "No"}`;
    t += `\nRecurrente: ${x.esRecurrente ?? "No"}`;
    if (x.centroCostos) t += `\nCentro costos: ${x.centroCostos}`;
    if (x.idViaje) t += `\nID Viaje: ${x.idViaje}`;
    if (x.solicitadoPor) t += `\nSolicitado por: ${x.solicitadoPor}`;
    if (x.notas) t += `\nNotas: ${x.notas}`;
    t += "\n\n¿Confirmás la reserva? (Sí/No)";
    return t;
  }

  const submitReserva = useCallback(async () => {
    if (!session?.user) return;
    setSubmitting(true);
    const a = answers;
    const baseReserva = {
      id_viaje: a.idViaje ?? "",
      usuario_id: session.user.id,
      tipo_viaje: a.tipoViaje ?? "pasajero",
      fecha_viaje: a.fechaViaje ?? "",
      hora_viaje: a.horaViaje ?? "",
      origen_calle: a.origenCalle ?? "",
      origen_altura: a.origenAltura ?? "",
      origen_localidad: a.origenLocalidad ?? "",
      origen_observaciones: null,
      destino_calle: a.destinoCalle ?? "",
      destino_altura: a.destinoAltura ?? "",
      destino_localidad: a.destinoLocalidad ?? "",
      destino_observaciones: null,
      pasajero_nombre: a.pasajeroNombre ?? "",
      pasajero_cantidad: 1,
      pasajero_telefono: a.pasajeroTelefono ?? "",
      con_espera: a.conEspera === "SI",
      ida_y_vuelta: a.idaYVuelta === "SI",
      es_recurrente: a.esRecurrente === "SI",
      dias_recurrente: a.diasRecurrente?.length ? a.diasRecurrente : null,
      hora_recurrente: a.horaRecurrente ?? null,
      fecha_inicio_recurrente: a.fechaInicioRecurrente ?? null,
      fecha_fin_recurrente: a.fechaFinRecurrente ?? null,
      centro_costos: a.centroCostos ?? "",
      solicitado_por: a.solicitadoPor ?? "",
      mail_solicitante: session.user.email ?? null,
      notas: a.notas || null,
      estado: "a_confirmar",
    };
    const reservasAInsertar =
      a.idaYVuelta === "SI" && a.conEspera === "NO"
        ? [baseReserva, baseReserva]
        : [baseReserva];
    const { data: reservasInsertadas, error: reservasError } = await supabase
      .from("reservas")
      .insert(reservasAInsertar)
      .select("id");
    if (reservasError) {
      addAgent("Error al crear la reserva: " + reservasError.message);
      setSubmitting(false);
      return;
    }
    if (a.paradas?.length && reservasInsertadas?.length) {
      const paradasPayload = a.paradas.flatMap((p) =>
        reservasInsertadas.map((r) => ({
          reserva_id: r.id,
          calle: p.calle,
          altura: p.altura,
          localidad: p.localidad,
          pasajero_nombre: p.pasajeroNombre ?? null,
          pasajero_telefono: p.pasajeroTelefono ?? null,
        })),
      );
      await supabase.from("paradas").insert(paradasPayload);
    }
    addAgent("Reserva creada correctamente. Será confirmada por el operador.");
    setStep("greeting");
    setAnswers({});
    setParadaIndex(0);
    setSubmitting(false);
  }, [session, answers, addAgent]);

  const handleSend = useCallback(() => {
    const raw = inputValue.trim();
    if (!raw && step !== "notas") return;
    const value = raw || "omitir";
    addUser(step === "greeting" ? (raw === "2" ? "Consultar mis reservas" : "Nueva reserva") : value);

    if (step === "greeting") {
      if (raw === "2" || raw.toLowerCase().includes("consultar")) {
        router.push("/mis-reservas");
        setOpen(false);
        return;
      }
      if (raw === "1" || raw.toLowerCase().includes("nueva")) {
        setInputValue("");
        void loadConfigAndStart();
        return;
      }
      setInputValue("");
      return;
    }

    setInputValue("");
    const newAnswers = { ...answers };

    if (step === "tipo_viaje") {
      newAnswers.tipoViaje = raw === "2" ? "mensajeria" : "pasajero";
    } else if (step === "fecha_viaje") {
      newAnswers.fechaViaje = value;
    } else if (step === "hora_viaje") {
      newAnswers.horaViaje = value;
    } else if (step === "origen_calle") {
      newAnswers.origenCalle = value;
    } else if (step === "origen_altura") {
      newAnswers.origenAltura = value;
    } else if (step === "origen_localidad") {
      newAnswers.origenLocalidad = value;
    } else if (step === "destino_calle") {
      newAnswers.destinoCalle = value;
    } else if (step === "destino_altura") {
      newAnswers.destinoAltura = value;
    } else if (step === "destino_localidad") {
      newAnswers.destinoLocalidad = value;
    } else if (step === "pasajero_nombre") {
      newAnswers.pasajeroNombre = value;
    } else if (step === "pasajero_telefono") {
      newAnswers.pasajeroTelefono = value;
    } else if (step === "paradas_sn") {
      if (value.toUpperCase().startsWith("S")) {
        newAnswers.paradas = [];
      }
    } else if (
      step === "parada_calle" ||
      step === "parada_altura" ||
      step === "parada_localidad" ||
      step === "parada_pasajero" ||
      step === "parada_telefono"
    ) {
      const list = [...(newAnswers.paradas ?? [])];
      while (list.length <= paradaIndex) {
        list.push({ calle: "", altura: "", localidad: "" });
      }
      const p = list[paradaIndex]!;
      if (step === "parada_calle") p.calle = value;
      if (step === "parada_altura") p.altura = value;
      if (step === "parada_localidad") p.localidad = value;
      if (step === "parada_pasajero") p.pasajeroNombre = value;
      if (step === "parada_telefono") p.pasajeroTelefono = value;
      newAnswers.paradas = list;
    } else if (step === "ida_y_vuelta") {
      newAnswers.idaYVuelta = value.toUpperCase().startsWith("S") ? "SI" : "NO";
    } else if (step === "con_espera") {
      newAnswers.conEspera = value.toUpperCase().startsWith("S") ? "SI" : "NO";
    } else if (step === "es_recurrente") {
      newAnswers.esRecurrente = value.toUpperCase().startsWith("S") ? "SI" : "NO";
    } else if (step === "dias_recurrente") {
      newAnswers.diasRecurrente = value.split(/[,;]/).map((d) => d.trim()).filter(Boolean);
    } else if (step === "hora_recurrente") {
      newAnswers.horaRecurrente = value;
    } else if (step === "fecha_inicio_recurrente") {
      newAnswers.fechaInicioRecurrente = value;
    } else if (step === "fecha_fin_recurrente") {
      newAnswers.fechaFinRecurrente = value;
    } else if (step === "centro_costos") {
      newAnswers.centroCostos = value;
    } else if (step === "id_viaje") {
      newAnswers.idViaje = value;
    } else if (step === "solicitado_por") {
      newAnswers.solicitadoPor = value;
    } else if (step === "notas") {
      newAnswers.notas = value === "omitir" || value.toLowerCase() === "listo" ? "" : value;
    } else if (step === "confirmar") {
      if (value.toUpperCase().startsWith("S")) {
        void submitReserva();
      } else {
        addAgent("Reserva cancelada. ¿En qué más puedo ayudarte?");
        setStep("greeting");
        setAnswers({});
      }
      setAnswers(newAnswers);
      return;
    }

    setAnswers(newAnswers);
    const nextStep = advanceStep(step, value, newAnswers);
    if (nextStep === "parada_calle" && step === "parada_otra") {
      setParadaIndex((i) => i + 1);
    }
    if (nextStep) {
      let s = nextStep;
      while (true) {
        if (s === "centro_costos" && !config?.centro_costos) {
          s = config?.id_viaje ? "id_viaje" : config?.solicitado_por ? "solicitado_por" : "notas";
          continue;
        }
        if (s === "id_viaje" && !config?.id_viaje) {
          s = config?.solicitado_por ? "solicitado_por" : "notas";
          continue;
        }
        if (s === "solicitado_por" && !config?.solicitado_por) {
          s = "notas";
          continue;
        }
        break;
      }
      setStep(s);
      if (s === "confirmar") {
        addAgent(buildResumen(newAnswers));
      } else {
        const q = getNextQuestion(s);
        if (q) addAgent(q);
      }
    }
  }, [
    step,
    inputValue,
    answers,
    paradaIndex,
    config,
    addUser,
    addAgent,
    advanceStep,
    getNextQuestion,
    loadConfigAndStart,
    submitReserva,
    router,
  ]);

  const showChoiceButtons = step === "greeting";
  const showConfirmButtons = step === "confirmar";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg transition hover:bg-zinc-800"
        aria-label="Abrir chat con agente"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2">
            <span className="text-sm font-semibold text-zinc-900">
              Agente de reservas
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
              aria-label="Cerrar chat"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex max-h-96 flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-900"
                    }`}
                  >
                    <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600">
                    Cargando...
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-zinc-200 p-3">
              {showChoiceButtons && (
                <div className="mb-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      addUser("Nueva reserva");
                      setInputValue("");
                      void loadConfigAndStart();
                    }}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                  >
                    1) Nueva reserva
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addUser("Consultar mis reservas");
                      router.push("/mis-reservas");
                      setOpen(false);
                    }}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    2) Consultar mis reservas
                  </button>
                </div>
              )}
              {showConfirmButtons && (
                <div className="mb-2 flex gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      addUser("Sí");
                      setInputValue("");
                      void submitReserva();
                    }}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    Sí, confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addUser("No");
                      addAgent("Reserva cancelada. ¿En qué más puedo ayudarte?");
                      setStep("greeting");
                      setAnswers({});
                    }}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    No
                  </button>
                </div>
              )}
              {!showChoiceButtons && !showConfirmButtons && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Escribí tu respuesta..."
                    className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                  >
                    Enviar
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
