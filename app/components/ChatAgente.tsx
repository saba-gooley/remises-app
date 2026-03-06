"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
  tieneParadas?: boolean;
};

const SALUDO =
  "¿En qué puedo ayudarte?\n1) Nueva reserva\n2) Consultar mis reservas\n3) Consultar disponibilidad";

// Opciones de modo ocultas — reservadas para uso futuro si el chat conversacional falla
const PREGUNTA_MODO =
  "¿Cómo querés continuar?\n1) Dictar (mensaje libre, clásico)\n2) Guiarme (pregunta a pregunta)\n3) Chatear con el agente (conversacional)";

/** Orden de pasos obligatorios para detectar el primero faltante tras interpretar texto libre. */
const ORDERED_REQUIRED_STEPS: string[] = [
  "tipo_viaje",
  "fecha_viaje",
  "hora_viaje",
  "origen_calle",
  "origen_altura",
  "origen_localidad",
  "destino_calle",
  "destino_altura",
  "destino_localidad",
  "pasajero_nombre",
  "pasajero_telefono",
];

const STEP_TO_ANSWER_KEY: Record<string, keyof Answers> = {
  tipo_viaje: "tipoViaje",
  fecha_viaje: "fechaViaje",
  hora_viaje: "horaViaje",
  origen_calle: "origenCalle",
  origen_altura: "origenAltura",
  origen_localidad: "origenLocalidad",
  destino_calle: "destinoCalle",
  destino_altura: "destinoAltura",
  destino_localidad: "destinoLocalidad",
  pasajero_nombre: "pasajeroNombre",
  pasajero_telefono: "pasajeroTelefono",
};

/** camelCase (API) -> step id para ordenar por ORDERED_REQUIRED_STEPS. */
const CAMEL_TO_STEP: Record<string, string> = {
  tipoViaje: "tipo_viaje",
  fechaViaje: "fecha_viaje",
  horaViaje: "hora_viaje",
  origenCalle: "origen_calle",
  origenAltura: "origen_altura",
  origenLocalidad: "origen_localidad",
  destinoCalle: "destino_calle",
  destinoAltura: "destino_altura",
  destinoLocalidad: "destino_localidad",
  pasajeroNombre: "pasajero_nombre",
  pasajeroTelefono: "pasajero_telefono",
};

/** Devuelve el siguiente paso cuando se omitió paradas_sn (tieneParadas false). Solo pasos obligatorios por cliente o notas/confirmar. */
function getNextStepAfterParadasOmitida(
  answers: Partial<Answers>,
  config: ConfigCampos | null,
): string {
  if (!answers.idaYVuelta) return "ida_y_vuelta";
  if (answers.idaYVuelta === "SI" && !answers.conEspera) return "con_espera";
  if (!answers.esRecurrente) return "es_recurrente";
  if (answers.esRecurrente === "SI") {
    if (!answers.diasRecurrente?.length) return "dias_recurrente";
    if (!answers.horaRecurrente) return "hora_recurrente";
    if (!answers.fechaInicioRecurrente) return "fecha_inicio_recurrente";
    if (!answers.fechaFinRecurrente) return "fecha_fin_recurrente";
  }
  if (config?.centro_costos && !answers.centroCostos) return "centro_costos";
  if (config?.id_viaje && !answers.idViaje) return "id_viaje";
  if (config?.solicitado_por && !answers.solicitadoPor) return "solicitado_por";
  return "notas";
}

/** Formatea fecha YYYY-MM-DD a DD/MM/YYYY para mostrar. */
function formatFechaDisplay(fecha: string | undefined): string {
  if (!fecha || !fecha.trim()) return "";
  const m = fecha.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return fecha;
}

/** Arma el resumen "Entendí lo siguiente: ..." con los datos extraídos. Usa solo claves camelCase (tipoViaje, fechaViaje, etc.). */
function buildResumenEntendido(a: Partial<Answers>): string {
  const partes: string[] = [];
  const tipo = a.tipoViaje != null && String(a.tipoViaje).trim() ? a.tipoViaje : "";
  if (tipo) partes.push(`Tipo: ${tipo === "mensajeria" ? "Mensajería" : "Pasajero"}`);
  const fecha = a.fechaViaje != null ? formatFechaDisplay(String(a.fechaViaje)) : "";
  if (fecha) partes.push(`Fecha: ${fecha}`);
  const hora = a.horaViaje != null ? String(a.horaViaje).trim() : "";
  if (hora) partes.push(`Hora: ${hora}`);
  const origenCalle = a.origenCalle != null ? String(a.origenCalle).trim() : "";
  const origenAltura = a.origenAltura != null ? String(a.origenAltura).trim() : "";
  const origenLocalidad = a.origenLocalidad != null ? String(a.origenLocalidad).trim() : "";
  const origen = [origenCalle, origenAltura].filter(Boolean).join(" ").trim();
  if (origen || origenLocalidad) partes.push(`Origen: ${[origen, origenLocalidad].filter(Boolean).join(" ").trim()}`);
  const destinoCalle = a.destinoCalle != null ? String(a.destinoCalle).trim() : "";
  const destinoAltura = a.destinoAltura != null ? String(a.destinoAltura).trim() : "";
  const destinoLocalidad = a.destinoLocalidad != null ? String(a.destinoLocalidad).trim() : "";
  const destino = [destinoCalle, destinoAltura].filter(Boolean).join(" ").trim();
  if (destino || destinoLocalidad) partes.push(`Destino: ${[destino, destinoLocalidad].filter(Boolean).join(" ").trim()}`);
  const pasajero = a.pasajeroNombre != null ? String(a.pasajeroNombre).trim() : "";
  if (pasajero) partes.push(`Pasajero: ${pasajero}`);
  const tel = a.pasajeroTelefono != null ? String(a.pasajeroTelefono).trim() : "";
  if (tel) partes.push(`Tel: ${tel}`);
  return partes.length > 0 ? `Entendí lo siguiente: ${partes.join(", ")}` : "No pude extraer datos del mensaje.";
}

/** Mapeo snake_case -> camelCase para normalizar respuesta de la API. */
const API_KEY_TO_CAMEL: Record<string, keyof Answers> = {
  tipo_viaje: "tipoViaje",
  fecha_viaje: "fechaViaje",
  hora_viaje: "horaViaje",
  origen_calle: "origenCalle",
  origen_altura: "origenAltura",
  origen_localidad: "origenLocalidad",
  destino_calle: "destinoCalle",
  destino_altura: "destinoAltura",
  destino_localidad: "destinoLocalidad",
  pasajero_nombre: "pasajeroNombre",
  pasajero_telefono: "pasajeroTelefono",
  ida_y_vuelta: "idaYVuelta",
  con_espera: "conEspera",
  es_recurrente: "esRecurrente",
  centro_costos: "centroCostos",
  id_viaje: "idViaje",
  solicitado_por: "solicitadoPor",
  tiene_paradas: "tieneParadas",
};

/** Normaliza los datos devueltos por la API: claves a camelCase y hora a HH:MM. */
function normalizeDatosFromApi(datos: Record<string, unknown> | null): Partial<Answers> {
  if (!datos || typeof datos !== "object") return {};
  const out: Partial<Answers> = {};
  for (const [key, value] of Object.entries(datos)) {
    const camelKey = API_KEY_TO_CAMEL[key] ?? (key as keyof Answers);
    if (value === null || value === undefined) continue;
    if (camelKey === "horaViaje" && typeof value === "string") {
      const normalized = parseAndValidateHora(value);
      out.horaViaje = normalized ?? value.trim();
    } else if (camelKey === "horaRecurrente" && typeof value === "string") {
      const normalized = parseAndValidateHora(value);
      out.horaRecurrente = normalized ?? value.trim();
    } else {
      (out as Record<string, unknown>)[camelKey] = typeof value === "string" ? value.trim() : value;
    }
  }
  return out;
}

/** Normaliza un string de hora a formato HH:MM antes de validar. Acepta "18:00 hs", "18.00", "9:00 am", etc. */
function normalizeHoraInput(input: string): string {
  let s = input.trim();
  s = s.replace(/\s*(hs|h\.?|hrs?|horas?)\s*$/gi, "").trim();
  s = s.replace(/\./g, ":");
  s = s.replace(/\s+/g, " ");
  return s;
}

/** Parsea y normaliza hora a HH:MM. Acepta "14:25", "2:25 pm", "14:25 hs", "18.00 hs". Retorna null si no es válido. */
function parseAndValidateHora(input: string): string | null {
  const s = normalizeHoraInput(input);
  if (!s) return null;
  const match24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1]!, 10);
    const m = parseInt(match24[2]!, 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    return null;
  }
  const match12 = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (match12) {
    let h = parseInt(match12[1]!, 10);
    const m = parseInt(match12[2]!, 10);
    const ampm = match12[3]!.toLowerCase();
    if (m < 0 || m > 59) return null;
    if (ampm === "pm") {
      if (h !== 12) h += 12;
    } else {
      if (h === 12) h = 0;
    }
    if (h < 0 || h > 23) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const onlyDigits = s.replace(/\D/g, "");
  if (onlyDigits.length === 3) {
    const h = parseInt(onlyDigits.slice(0, 1), 10);
    const m = parseInt(onlyDigits.slice(1), 10);
    if (h >= 0 && h <= 9 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  if (onlyDigits.length === 4) {
    const h = parseInt(onlyDigits.slice(0, 2), 10);
    const m = parseInt(onlyDigits.slice(2), 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  return null;
}

/** Parsea fecha DD/MM/YYYY o YYYY-MM-DD. Retorna { value, error } donde error puede ser "formato" | "pasada" | null. */
function parseAndValidateFecha(input: string): { value: string | null; error: "formato" | "pasada" | null } {
  const s = input.trim();
  let day: number;
  let month: number;
  let year: number;
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    day = parseInt(ddmmyyyy[1]!, 10);
    month = parseInt(ddmmyyyy[2]!, 10) - 1;
    year = parseInt(ddmmyyyy[3]!, 10);
  } else {
    const yyyymmdd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyymmdd) {
      year = parseInt(yyyymmdd[1]!, 10);
      month = parseInt(yyyymmdd[2]!, 10) - 1;
      day = parseInt(yyyymmdd[3]!, 10);
    } else {
      return { value: null, error: "formato" };
    }
  }
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return { value: null, error: "formato" };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date.getTime() < today.getTime()) {
    return { value: null, error: "pasada" };
  }
  return { value: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`, error: null };
}

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
  const [missingStepsAfterDictar, setMissingStepsAfterDictar] = useState<string[] | null>(null);
  const [historialConversacional, setHistorialConversacional] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [datosConversacional, setDatosConversacional] = useState<Partial<Answers>>({});
  const [esConsulta, setEsConsulta] = useState(false);
  const esConsultaRef = useRef(false); // ref para evitar stale closures en callbacks async
  const [nombreUsuario, setNombreUsuario] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const addAgent = useCallback((text: string) => {
    setMessages((m) => [...m, { role: "agent", text }]);
  }, []);
  const addUser = useCallback((text: string) => {
    setMessages((m) => [...m, { role: "user", text }]);
  }, []);

  // Cargar nombre del usuario al montar el componente
  useEffect(() => {
    const loadNombre = async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s?.user) return;
      const { data: usuario } = await supabase
        .from("usuarios")
        .select("nombre")
        .eq("id", s.user.id)
        .maybeSingle();
      const nombre = usuario?.nombre ?? s.user.email?.split("@")[0] ?? null;
      setNombreUsuario(nombre);
    };
    void loadNombre();
  }, []);

  useEffect(() => {
    if (!open) return;
    if (messages.length === 0) {
      const saludo = nombreUsuario
        ? `¡Hola, ${nombreUsuario}! Soy Camila, tu asistente de reservas. 😊`
        : "¡Hola! Soy Camila, tu asistente de reservas. 😊";
      addAgent(saludo);
      addAgent(SALUDO);
    }
  }, [open, messages.length, addAgent, nombreUsuario]);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages, loading]);

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
    // Ir directamente al chat conversacional (Dictar/Guiarme ocultos para uso futuro)
    setAnswers({});
    setHistorialConversacional([]);
    setDatosConversacional({});
    setMissingStepsAfterDictar(null);
    setParadaIndex(0);
    esConsultaRef.current = false;
    setEsConsulta(false);
    setStep("chat_conversacional");
    addAgent("¡Perfecto! Contame los datos del viaje como quieras y yo los voy completando. Podés darme todo en un mensaje o de a poco.");
  }, [addAgent]);

  const startGuidedFlow = useCallback(() => {
    setMissingStepsAfterDictar(null);
    setHistorialConversacional([]);
    setDatosConversacional({});
    setStep("tipo_viaje");
    addAgent("Tipo de viaje: 1) Pasajero  2) Mensajería");
  }, [addAgent]);

  const startConversationalFlow = useCallback(() => {
    setHistorialConversacional([]);
    setDatosConversacional({});
    setMissingStepsAfterDictar(null);
    esConsultaRef.current = false;
    setEsConsulta(false);
    setStep("chat_conversacional");
    addAgent("¡Perfecto! Contame los datos del viaje como quieras y yo los voy completando. Podés darme todo en un mensaje o de a poco.");
  }, [addAgent]);

  const startConsultaFlow = useCallback(async () => {
    setLoading(true);
    const { data: { session: s } } = await supabase.auth.getSession();
    setSession(s ?? null);
    if (!s?.user?.email) {
      addAgent("Necesitás iniciar sesión para consultar disponibilidad.");
      setStep("greeting");
      setLoading(false);
      return;
    }
    const { data: usuario } = await supabase
      .from("usuarios").select("cliente_id").eq("email", s.user.email).maybeSingle();
    if (usuario?.cliente_id) {
      const { data: cliente } = await supabase
        .from("clientes").select("configuracion_campos").eq("id", usuario.cliente_id).maybeSingle();
      if (cliente?.configuracion_campos) setConfig(cliente.configuracion_campos as ConfigCampos);
    }
    setLoading(false);
    setAnswers({});
    setHistorialConversacional([]);
    setDatosConversacional({});
    setMissingStepsAfterDictar(null);
    setParadaIndex(0);
    esConsultaRef.current = true;
    setEsConsulta(true);
    setStep("chat_conversacional");
    addAgent("¡Perfecto! Contame los datos del viaje para la consulta de disponibilidad. Podés darme todo en un mensaje o de a poco.");
  }, [addAgent]);

  /** True si el valor se considera vacío (no extraído). */
  const isFieldEmpty = useCallback((val: unknown): boolean => {
    if (val === undefined || val === null) return true;
    if (typeof val === "string") return !val.trim();
    return false;
  }, []);

  /** Devuelve el primer paso obligatorio que falta en `answers`. Solo considera faltante si el valor está vacío o es null. */
  const getFirstMissingStep = useCallback(
    (currentAnswers: Answers): string | null => {
      for (const step of ORDERED_REQUIRED_STEPS) {
        const key = STEP_TO_ANSWER_KEY[step];
        if (!key) continue;
        const val = currentAnswers[key];
        if (isFieldEmpty(val)) return step;
      }
      return null;
    },
    [isFieldEmpty],
  );

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
            return "centro_costos";
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
        case "tipo_viaje":
          return "Tipo de viaje: 1) Pasajero  2) Mensajería";
        case "fecha_viaje":
          return "Fecha del viaje (DD/MM/YYYY):";
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

  const submitReserva = useCallback(async (answersOverride?: Answers) => {
    if (!session?.user) {
      console.error("[ChatAgente] submitReserva: no hay sesión", { session });
      addAgent("Tu sesión expiró. Por favor recargá la página e iniciá sesión nuevamente.");
      return;
    }
    setSubmitting(true);
    const a = answersOverride ?? answers;
    console.log("[ChatAgente] submitReserva llamado. Fuente:", answersOverride ? "override (conversacional)" : "state (guiado)");
    console.log("[ChatAgente] answers a usar:", a);

    // Obtener cliente_id del usuario logueado
    let clienteId: string | null = null;
    const { data: usuarioData } = await supabase
      .from("usuarios")
      .select("cliente_id")
      .eq("id", session.user.id)
      .maybeSingle();
    clienteId = usuarioData?.cliente_id ?? null;

    const baseReserva = {
      id_viaje: a.idViaje ?? "",
      usuario_id: session.user.id,
      cliente_id: clienteId,
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
      dias_recurrente: Array.isArray(a.diasRecurrente) && a.diasRecurrente.length > 0 ? a.diasRecurrente : null,
      hora_recurrente: a.horaRecurrente ?? null,
      fecha_inicio_recurrente: a.fechaInicioRecurrente ?? null,
      fecha_fin_recurrente: a.fechaFinRecurrente ?? null,
      centro_costos: a.centroCostos ?? "",
      solicitado_por: a.solicitadoPor ?? "",
      mail_solicitante: session.user.email ?? null,
      notas: a.notas ? [a.notas] : [],
      estado: "a_confirmar",
      creado_en: new Date().toISOString(),
    };
    const reservasAInsertar =
      a.idaYVuelta === "SI" && a.conEspera === "NO"
        ? [baseReserva, baseReserva]
        : [baseReserva];
    console.log("[ChatAgente] Payload a insertar en Supabase:", JSON.stringify(reservasAInsertar, null, 2));
    const { data: reservasInsertadas, error: reservasError } = await supabase
      .from("reservas")
      .insert(reservasAInsertar)
      .select("id");
    console.log("[ChatAgente] Resultado insert reservas:", { reservasInsertadas, reservasError });
    if (reservasError) {
      console.error("[ChatAgente] Error al insertar reservas:", reservasError);
      addAgent("Hubo un problema al crear la reserva. ¿Querés intentarlo de nuevo?");
      setSubmitting(false);
      return;
    }
    console.log("[ChatAgente] POST-INSERT: a.paradas =", a.paradas, "length =", a.paradas?.length);
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
      console.log("[ChatAgente] Objeto a insertar en Supabase (paradas):", paradasPayload);
      const { error: paradasError } = await supabase
        .from("paradas")
        .insert(paradasPayload);
      if (paradasError) {
        console.error("[ChatAgente] Error al insertar paradas:", paradasError);
        addAgent("Hubo un problema al crear la reserva. ¿Querés intentarlo de nuevo?");
        setSubmitting(false);
        return;
      }
    }
    console.log("[ChatAgente] PRE-ADDAGENT: llegó al mensaje de éxito");
    addAgent("Reserva creada correctamente. Será confirmada por el operador.");
    setStep("greeting");
    setAnswers({});
    setParadaIndex(0);
    setMissingStepsAfterDictar(null);
    setSubmitting(false);
  }, [session, answers, addAgent]);

  const submitConsulta = useCallback(async (answersOverride?: Answers) => {
    if (!session?.user) {
      console.error("[ChatAgente] submitConsulta: no hay sesión activa");
      addAgent("Tu sesión expiró. Por favor recargá la página e iniciá sesión nuevamente.");
      return;
    }
    setSubmitting(true);
    const a = answersOverride ?? answers;

    let clienteId: string | null = null;
    const { data: usuarioData } = await supabase
      .from("usuarios").select("cliente_id").eq("id", session.user.id).maybeSingle();
    clienteId = usuarioData?.cliente_id ?? null;

    const payload = {
      usuario_id: session.user.id,
      cliente_id: clienteId,
      tipo_viaje: a.tipoViaje ?? "pasajero",
      fecha_viaje: a.fechaViaje || null,
      hora_viaje: a.horaViaje || null,
      origen_calle: a.origenCalle ?? "",
      origen_altura: a.origenAltura ?? "",
      origen_localidad: a.origenLocalidad ?? "",
      destino_calle: a.destinoCalle ?? "",
      destino_altura: a.destinoAltura ?? "",
      destino_localidad: a.destinoLocalidad ?? "",
      pasajero_nombre: a.pasajeroNombre ?? "",
      pasajero_cantidad: 1,
      pasajero_telefono: a.pasajeroTelefono ?? "",
      con_espera: a.conEspera === "SI",
      ida_y_vuelta: a.idaYVuelta === "SI",
      es_recurrente: a.esRecurrente === "SI",
      dias_recurrente: Array.isArray(a.diasRecurrente) && a.diasRecurrente.length > 0 ? a.diasRecurrente : null,
      hora_recurrente: a.horaRecurrente || null,
      fecha_inicio_recurrente: a.fechaInicioRecurrente || null,
      fecha_fin_recurrente: a.fechaFinRecurrente || null,
      id_viaje: a.idViaje ?? null,
      centro_costos: a.centroCostos ?? "",
      solicitado_por: a.solicitadoPor ?? "",
      mail_solicitante: session.user.email ?? null,
      notas: a.notas ? [a.notas] : [],
      estado: "pendiente",
      creado_en: new Date().toISOString(),
    };

    console.log("[ChatAgente] submitConsulta payload:", JSON.stringify(payload, null, 2));
    const { error: consultaError } = await supabase.from("consultas").insert(payload);
    if (consultaError) {
      console.error("[ChatAgente] Error al insertar consulta:", consultaError);
      addAgent(`Hubo un problema al registrar la consulta: ${consultaError.message}. ¿Querés intentarlo de nuevo?`);
      setSubmitting(false);
      return;
    }
    addAgent("Tu consulta fue registrada. Te notificaremos cuando tengamos una respuesta.");
    setStep("greeting");
    setAnswers({});
    setParadaIndex(0);
    setMissingStepsAfterDictar(null);
    esConsultaRef.current = false;
    setEsConsulta(false);
    setSubmitting(false);
  }, [session, answers, addAgent]);

  const handleSend = useCallback(() => {
    const raw = inputValue.trim();
    if (!raw && step !== "notas") return;
    const value = raw || "omitir";
    const greetingLabel = raw === "2" ? "Consultar mis reservas" : raw === "3" ? "Consultar disponibilidad" : "Nueva reserva";
    addUser(step === "greeting" ? greetingLabel : value);

    if (step === "greeting") {
      if (raw === "2" || (raw.toLowerCase().includes("consultar") && raw.toLowerCase().includes("reserva"))) {
        router.push("/mis-reservas");
        setOpen(false);
        return;
      }
      if (raw === "3" || raw.toLowerCase().includes("disponibilidad")) {
        setInputValue("");
        void startConsultaFlow();
        return;
      }
      if (raw === "1" || raw.toLowerCase().includes("nueva reserva") || raw.toLowerCase().includes("reserva")) {
        setInputValue("");
        void loadConfigAndStart();
        return;
      }
      setInputValue("");
      return;
    }

    if (step === "modo_reserva") {
      setInputValue("");
      if (
        raw === "2" ||
        raw.toLowerCase().includes("guiar") ||
        raw.toLowerCase().includes("pregunta")
      ) {
        startGuidedFlow();
        return;
      }
      if (raw === "1" || raw.toLowerCase().includes("dictar")) {
        setStep("dictar_texto");
        addAgent(
          "Contame los datos del viaje en un mensaje (origen, destino, fecha, hora, pasajero, teléfono, etc.).",
        );
        return;
      }
      if (
        raw === "3" ||
        raw.toLowerCase().includes("chat") ||
        raw.toLowerCase().includes("conversa") ||
        raw.toLowerCase().includes("agente")
      ) {
        startConversationalFlow();
        return;
      }
      return;
    }

    if (step === "chat_conversacional") {
      setInputValue("");
      setLoading(true);
      const nuevoHistorial = [...historialConversacional];
      fetch("/api/chat-reserva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historial: nuevoHistorial, mensaje: raw, configCampos: config }),
      })
        .then(async (res) => {
          const data = await res.json() as { message?: string; reservaCompleta?: boolean; datos?: Partial<Answers>; error?: string; debug?: unknown };
          if (!res.ok || data.error) {
            console.error("[chat-reserva] error:", data);
            addAgent(`Hubo un error al contactar al asistente (${data.error ?? res.status}). ¿Podés intentarlo de nuevo?`);
            return;
          }
          const msgAsistente = data.message ?? "No entendí. ¿Podés repetirlo?";
          addAgent(msgAsistente);
          setHistorialConversacional([
            ...nuevoHistorial,
            { role: "user" as const, content: raw },
            { role: "assistant" as const, content: msgAsistente },
          ]);
          if (data.datos) {
            // Solo mezclar valores no-nulos para no destruir datos acumulados previos.
            // Excepción: paradas y tieneParadas siempre se aplican (aunque sean null/false) para no heredar datos viejos.
            const arrayFields = new Set(["paradas", "tieneParadas"]);
            const nonNullDatos = Object.fromEntries(
              Object.entries(data.datos).filter(([k, v]) => arrayFields.has(k) || (v !== null && v !== undefined && v !== "")),
            );
            setDatosConversacional((prev) => ({ ...prev, ...nonNullDatos }));
            setAnswers((prev) => ({ ...prev, ...nonNullDatos }));
          }
          if (data.reservaCompleta) {
            setStep("confirmar_conversacional");
          }
        })
        .catch((err: unknown) => {
          console.error("[chat-reserva] fetch error:", err);
          addAgent("No se pudo contactar al asistente. Revisá tu conexión e intentá de nuevo.");
        })
        .finally(() => setLoading(false));
      return;
    }

    if (step === "confirmar_conversacional") {
      setInputValue("");
      setLoading(true);
      const nuevoHistorial2 = [...historialConversacional];
      // Capturar antes del fetch para evitar cualquier cambio asíncrono
      const isConsultaCapturada = esConsultaRef.current;
      const rawLower = raw.toLowerCase();
      const esConfirmacionUsuario = ["si", "sí", "confirmo", "dale", "ok", "listo", "correcto", "confirmado", "todo bien", "está bien"].some(w => rawLower.includes(w));
      fetch("/api/chat-reserva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historial: nuevoHistorial2, mensaje: raw, configCampos: config }),
      })
        .then(async (res) => {
          const data = await res.json() as { message?: string; reservaCompleta?: boolean; accion?: string | null; datos?: Partial<Answers>; error?: string };
          // Si Claude devuelve reservaCompleta:true con accion:null pero el usuario claramente confirmó, forzar "confirmar"
          if (!data.accion && data.reservaCompleta && esConfirmacionUsuario) {
            data.accion = "confirmar";
          }
          if (!res.ok || data.error) {
            console.error("[chat-reserva] error en confirmar:", data);
            addAgent(`Hubo un error (${data.error ?? res.status}). ¿Podés intentarlo de nuevo?`);
            return;
          }
          const msgAsistente = data.message ?? "No entendí. ¿Podés repetirlo?";

          if (data.accion === "confirmar") {
            // Claude quiere confirmar → validar ANTES de mostrar su mensaje
            // Solo aplicar valores no-nulos; paradas/tieneParadas siempre se aplican para no heredar datos viejos
            const arrayFields = new Set(["paradas", "tieneParadas"]);
            const nonNullConfirmDatos = Object.fromEntries(
              Object.entries(data.datos ?? {}).filter(([k, v]) => arrayFields.has(k) || (v !== null && v !== undefined && v !== "")),
            );
            const mergedAnswers: Answers = { ...answers, ...datosConversacional, ...nonNullConfirmDatos };
            console.log("[ChatAgente] accion=confirmar, mergedAnswers:", mergedAnswers);

            if (mergedAnswers.fechaViaje) {
              const fechaViaje = new Date(mergedAnswers.fechaViaje + "T00:00:00");
              const hoy = new Date();
              hoy.setHours(0, 0, 0, 0);
              if (fechaViaje < hoy) {
                // NO mostramos el mensaje de Claude — mostramos el error directamente
                addAgent(
                  `La fecha del viaje (${mergedAnswers.fechaViaje.split("-").reverse().join("/")}) no puede ser anterior a hoy. ¿Querés indicarme una fecha correcta?`,
                );
                setHistorialConversacional([
                  ...nuevoHistorial2,
                  { role: "user" as const, content: raw },
                  { role: "assistant" as const, content: `La fecha ${mergedAnswers.fechaViaje} es anterior a hoy. Pedí fecha correcta.` },
                ]);
                setStep("chat_conversacional");
                return;
              }
            }

            // Fecha válida → crear reserva o consulta
            // Solo mostrar el mensaje de Claude si es una reserva; para consulta lo muestra submitConsulta
            if (!isConsultaCapturada) {
              addAgent(msgAsistente);
            }
            setHistorialConversacional([
              ...nuevoHistorial2,
              { role: "user" as const, content: raw },
              { role: "assistant" as const, content: msgAsistente },
            ]);
            if (data.datos) {
              setDatosConversacional((prev) => ({ ...prev, ...data.datos }));
            }
            setAnswers(mergedAnswers);
            console.log("[ChatAgente] submit decision: isConsultaCapturada =", isConsultaCapturada, "esConsultaRef.current =", esConsultaRef.current, "mergedAnswers:", mergedAnswers);
            if (isConsultaCapturada) {
              void submitConsulta(mergedAnswers);
            } else {
              void submitReserva(mergedAnswers);
            }
          } else {
            // Para todos los otros casos: mostrar el mensaje de Claude y actualizar historial/datos
            addAgent(msgAsistente);
            const historialActualizado = [
              ...nuevoHistorial2,
              { role: "user" as const, content: raw },
              { role: "assistant" as const, content: msgAsistente },
            ];
            setHistorialConversacional(historialActualizado);
            if (data.datos) {
              // Solo mezclar valores no-nulos; paradas/tieneParadas siempre se aplican para no heredar datos viejos
              const arrayFields = new Set(["paradas", "tieneParadas"]);
              const nonNullElseDatos = Object.fromEntries(
                Object.entries(data.datos).filter(([k, v]) => arrayFields.has(k) || (v !== null && v !== undefined && v !== "")),
              );
              setDatosConversacional((prev) => ({ ...prev, ...nonNullElseDatos }));
              setAnswers((prev) => ({ ...prev, ...nonNullElseDatos }));
            }
            if (data.accion === "cancelar_solicitado") {
              setStep("confirmar_conversacional");
            } else if (data.accion === "modificar" || data.reservaCompleta) {
              setStep("confirmar_conversacional");
            } else {
              setStep("chat_conversacional");
            }
          }
        })
        .catch((err: unknown) => {
          console.error("[chat-reserva] fetch error:", err);
          addAgent("No se pudo contactar al asistente. Revisá tu conexión e intentá de nuevo.");
        })
        .finally(() => setLoading(false));
      return;
    }

    if (step === "modificar_indicar") {
      setInputValue("");
      setLoading(true);
      const textoModif =
        "El usuario quiere modificar su reserva. Dice: \"" +
        raw +
        '". Datos actuales de la reserva: ' +
        JSON.stringify(answers);
      fetch("/api/interpretar-reserva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: textoModif }),
      })
        .then((res) => res.json())
        .then((data: { datos?: Record<string, unknown>; camposFaltantes?: string[] }) => {
          const rawDatos = data.datos ?? {};
          const datos = normalizeDatosFromApi(rawDatos);
          setAnswers((prev) => ({ ...prev, ...datos }));
          const merged = { ...answers, ...datos };
          addAgent("Actualicé los datos. Resumen:");
          addAgent(buildResumen(merged));
          setStep("confirmar");
        })
        .catch(() => {
          addAgent("No pude interpretar los cambios. Indicá de nuevo qué querés modificar o confirmá la reserva.");
        })
        .finally(() => setLoading(false));
      return;
    }

    if (step === "dictar_texto") {
      setInputValue("");
      setLoading(true);
      fetch("/api/interpretar-reserva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: raw }),
      })
        .then((res) => res.json())
        .then((data: { datos?: Record<string, unknown>; camposFaltantes?: string[]; mensajeFaltantes?: string }) => {
          const rawDatos = data.datos ?? {};
          const datos = normalizeDatosFromApi(rawDatos);
          setAnswers((prev) => ({ ...prev, ...datos }));
          const merged = { ...answers, ...datos };
          const resumenEntendido = buildResumenEntendido(merged);
          addAgent(resumenEntendido);

          const camposFaltantes = Array.isArray(data.camposFaltantes) ? data.camposFaltantes : [];
          if (camposFaltantes.length === 0) {
            setMissingStepsAfterDictar(null);
            setStep("confirmar");
            addAgent(buildResumen(merged));
            return;
          }

          const missingSteps = camposFaltantes
            .map((c) => CAMEL_TO_STEP[c] ?? c)
            .filter((s) => ORDERED_REQUIRED_STEPS.includes(s));
          const orderedMissing = ORDERED_REQUIRED_STEPS.filter((s) => missingSteps.includes(s));
          setMissingStepsAfterDictar(orderedMissing);
          const firstMissing = orderedMissing[0];
          if (firstMissing) {
            setStep(firstMissing);
            const q = getNextQuestion(firstMissing);
            if (q) addAgent(q);
          } else {
            setMissingStepsAfterDictar(null);
            const tieneParadas = rawDatos.tieneParadas === true || rawDatos.tiene_paradas === true;
            if (tieneParadas) {
              setStep("paradas_sn");
              addAgent("¿Tiene paradas intermedias? (Sí/No)");
            } else {
              const nextS = getNextStepAfterParadasOmitida(merged, config);
              setStep(nextS);
              const q = getNextQuestion(nextS);
              if (q) addAgent(q);
            }
          }
        })
        .catch(() => {
          addAgent("No pude interpretar el mensaje. ¿Querés que te guíe pregunta por pregunta? (Escribí Guiarme)");
          setStep("modo_reserva");
          addAgent(PREGUNTA_MODO);
        })
        .finally(() => setLoading(false));
      return;
    }

    setInputValue("");
    const newAnswers = { ...answers };

    if (step === "fecha_viaje") {
      const { value: parsedFecha, error: fechaError } = parseAndValidateFecha(raw);
      if (!parsedFecha) {
        addAgent(
          fechaError === "pasada"
            ? "La fecha del viaje no puede ser anterior a hoy. Por favor ingresá una fecha futura (DD/MM/YYYY)."
            : "No entendí la fecha. Por favor ingresá la fecha en formato DD/MM/YYYY, por ejemplo 15/03/2026.",
        );
        return;
      }
      newAnswers.fechaViaje = parsedFecha;
    } else if (step === "hora_viaje") {
      const parsed = parseAndValidateHora(raw);
      if (!parsed) {
        addAgent(
          "No entendí el formato de la hora. Por favor ingresá la hora en formato HH:MM, por ejemplo 14:25",
        );
        return;
      }
      newAnswers.horaViaje = parsed;
    } else if (step === "tipo_viaje") {
      newAnswers.tipoViaje = raw === "2" ? "mensajeria" : "pasajero";
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
      const parsed = parseAndValidateHora(raw);
      if (!parsed) {
        addAgent(
          "No entendí el formato de la hora. Por favor ingresá la hora en formato HH:MM, por ejemplo 14:25",
        );
        return;
      }
      newAnswers.horaRecurrente = parsed;
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
      } else if (raw.toLowerCase().includes("modif")) {
        addUser("Modificar");
        addAgent("Indicá qué datos querés cambiar (por ejemplo: la hora, el destino).");
        setStep("modificar_indicar");
      } else {
        addAgent("Reserva cancelada. ¿En qué más puedo ayudarte?");
        setStep("greeting");
        setAnswers({});
      }
      setAnswers(newAnswers);
      return;
    }

    if (missingStepsAfterDictar && missingStepsAfterDictar.includes(step)) {
      setAnswers(newAnswers);
      const idx = missingStepsAfterDictar.indexOf(step);
      const nextMissing = missingStepsAfterDictar[idx + 1];
      if (nextMissing !== undefined) {
        setStep(nextMissing);
        const q = getNextQuestion(nextMissing);
        if (q) addAgent(q);
      } else {
        setMissingStepsAfterDictar(null);
        setStep("paradas_sn");
        addAgent("¿Tiene paradas intermedias? (Sí/No)");
      }
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
        if (s === "ida_y_vuelta" && (newAnswers.idaYVuelta === "SI" || newAnswers.idaYVuelta === "NO")) {
          s = newAnswers.idaYVuelta === "SI" ? "con_espera" : "es_recurrente";
          continue;
        }
        if (s === "con_espera" && (newAnswers.conEspera === "SI" || newAnswers.conEspera === "NO")) {
          s = "es_recurrente";
          continue;
        }
        if (s === "es_recurrente" && (newAnswers.esRecurrente === "SI" || newAnswers.esRecurrente === "NO")) {
          s = newAnswers.esRecurrente === "SI" ? "dias_recurrente" : "centro_costos";
          continue;
        }
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
    missingStepsAfterDictar,
    addUser,
    addAgent,
    advanceStep,
    getNextQuestion,
    getFirstMissingStep,
    loadConfigAndStart,
    startGuidedFlow,
    startConversationalFlow,
    startConsultaFlow,
    submitReserva,
    submitConsulta,
    router,
  ]);

  const showChoiceButtons = step === "greeting";
  const showModoButtons = false; // oculto — flujo de modo desactivado, se va directo al chat conversacional
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
              <div ref={messagesEndRef} aria-hidden="true" />
            </div>
            <div className="border-t border-zinc-200 p-3">
              {showChoiceButtons && (
                <div className="mb-2 flex flex-wrap gap-2">
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
                    2) Mis reservas
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addUser("Consultar disponibilidad");
                      setInputValue("");
                      void startConsultaFlow();
                    }}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    3) Disponibilidad
                  </button>
                </div>
              )}
              {showModoButtons && (
                <div className="mb-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      addUser("Dictar");
                      setStep("dictar_texto");
                      addAgent(
                        "Contame los datos del viaje en un mensaje (origen, destino, fecha, hora, pasajero, teléfono, etc.).",
                      );
                    }}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                  >
                    1) Dictar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addUser("Guiarme");
                      startGuidedFlow();
                    }}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    2) Guiarme
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addUser("Chatear con el agente");
                      startConversationalFlow();
                    }}
                    className="rounded-md border border-zinc-500 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-200"
                  >
                    3) Chatear
                  </button>
                </div>
              )}
              {showConfirmButtons && (
                <div className="mb-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      addUser("Sí");
                      setInputValue("");
                      if (esConsultaRef.current) void submitConsulta();
                      else void submitReserva();
                    }}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    Sí, confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addUser("Modificar");
                      addAgent("Indicá qué datos querés cambiar (por ejemplo: la hora, el destino).");
                      setStep("modificar_indicar");
                    }}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Modificar
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
              {!showChoiceButtons && !showModoButtons && !showConfirmButtons && (
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
