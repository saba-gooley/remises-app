import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const REQUIRED_FIELDS = [
  "tipoViaje",
  "fechaViaje",
  "horaViaje",
  "origenCalle",
  "origenAltura",
  "origenLocalidad",
  "destinoCalle",
  "destinoAltura",
  "destinoLocalidad",
  "pasajeroNombre",
  "pasajeroTelefono",
] as const;

type DatosExtraidos = Partial<{
  tipoViaje: "pasajero" | "mensajeria";
  fechaViaje: string;
  horaViaje: string;
  origenCalle: string;
  origenAltura: string;
  origenLocalidad: string;
  destinoCalle: string;
  destinoAltura: string;
  destinoLocalidad: string;
  pasajeroNombre: string;
  pasajeroTelefono: string;
  idaYVuelta: "SI" | "NO";
  conEspera: "SI" | "NO";
  esRecurrente: "SI" | "NO";
  centroCostos: string;
  idViaje: string;
  solicitadoPor: string;
  notas: string;
}>;

const SNAKE_TO_CAMEL: Record<string, keyof DatosExtraidos> = {
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
};

function isEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === "string") return !val.trim();
  return false;
}

/** Normaliza hora a HH:MM (24h). Acepta "18:00 hs", "18.00", "9:00 am". */
function normalizeHora(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  let cleaned = s.replace(/\s*(hs|h\.?|hrs?|horas?)\s*$/gi, "").trim();
  cleaned = cleaned.replace(/\./g, ":");
  const match24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1]!, 10);
    const m = parseInt(match24[2]!, 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  const match12 = cleaned.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (match12) {
    let h = parseInt(match12[1]!, 10);
    const m = parseInt(match12[2]!, 10);
    const ampm = match12[3]!.toLowerCase();
    if (m >= 0 && m <= 59) {
      if (ampm === "pm" && h !== 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      if (h >= 0 && h <= 23) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 4) {
    const h = parseInt(digits.slice(0, 2), 10);
    const m = parseInt(digits.slice(2), 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  return s;
}

/** Normaliza fecha a YYYY-MM-DD. Acepta DD/MM/YYYY, YYYY-MM-DD. */
function normalizeFecha(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const day = parseInt(ddmmyyyy[1]!, 10);
    const month = parseInt(ddmmyyyy[2]!, 10);
    const year = parseInt(ddmmyyyy[3]!, 10);
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const yyyymmdd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) return s;
  return s;
}

/** Normaliza datos extraídos: claves camelCase, hora en HH:MM, fecha en YYYY-MM-DD. */
function normalizeDatos(raw: Record<string, unknown>): DatosExtraidos {
  const out: DatosExtraidos = {};
  for (const [key, value] of Object.entries(raw)) {
    const camelKey = SNAKE_TO_CAMEL[key] ?? (key as keyof DatosExtraidos);
    if (value === null || value === undefined) continue;
    if (camelKey === "horaViaje") {
      const normalized = normalizeHora(value);
      if (normalized) out.horaViaje = normalized;
    } else if (camelKey === "fechaViaje") {
      const normalized = normalizeFecha(value);
      if (normalized) out.fechaViaje = normalized;
    } else if (typeof value === "string") {
      (out as Record<string, unknown>)[camelKey] = value.trim();
    } else {
      (out as Record<string, unknown>)[camelKey] = value;
    }
  }
  return out;
}

const SYSTEM_PROMPT = `Eres un asistente que interpreta mensajes en español para extraer datos de una reserva de remis/traslado.
El usuario escribe en texto libre (ej: "necesito un remis mañana a las 9 de Corrientes 1234 CABA a Libertador 5678 para Juan, teléfono 1134567890").

IMPORTANTE: Extrae TODOS los datos que puedas inferir del mensaje. Solo pon null en campos que realmente no aparecen ni se pueden deducir.

Debes devolver ÚNICAMENTE un JSON válido, sin markdown ni texto adicional, con esta estructura exacta (usa camelCase en las claves):

{
  "datos": {
    "tipoViaje": "pasajero" o "mensajeria" (si no se menciona, "pasajero"),
    "fechaViaje": SIEMPRE en formato "YYYY-MM-DD" (ej: 2026-03-15). Inferir "mañana", "pasado mañana", "el 15/03", "15/3/26". Si no se puede, null),
    "horaViaje": SIEMPRE en formato "HH:MM" en 24h, SIN sufijos (ej: "09:00", "18:00"). NUNCA incluyas "hs", "h.", "hrs". Convertir "9 de la mañana" a "09:00", "18:00 hs" a "18:00". Si no se puede, null),
    "origenCalle": string o null,
    "origenAltura": string o null,
    "origenLocalidad": string o null,
    "destinoCalle": string o null,
    "destinoAltura": string o null,
    "destinoLocalidad": string o null,
    "pasajeroNombre": string o null,
    "pasajeroTelefono": string o null,
    "idaYVuelta": "SI" o "NO" o null,
    "conEspera": "SI" o "NO" o null,
    "esRecurrente": "SI" o "NO" o null,
    "centroCostos": string o null,
    "idViaje": string o null,
    "solicitadoPor": string o null,
    "notas": string o null
  },
  "camposFaltantes": ["solo las claves camelCase que están null o vacías en datos y son obligatorias para la reserva"],
  "mensajeFaltantes": "Frase amigable indicando SOLO los datos que realmente faltan, en español."
}

Reglas obligatorias:
- fechaViaje: SIEMPRE YYYY-MM-DD. Nunca devuelvas DD/MM/YYYY ni otro formato.
- horaViaje: SIEMPRE HH:MM (dos dígitos hora, dos dígitos minutos). Sin "hs", sin "hs.", sin espacios extra.
- Extrae todo lo que el texto indique: direcciones (calle y número por separado si se puede), localidad (CABA, Buenos Aires, etc.), nombre y teléfono del pasajero.
- En "camposFaltantes" incluye ÚNICAMENTE los campos que en "datos" quedaron null o vacíos. Si un campo tiene valor, NO lo incluyas en camposFaltantes.
- "mensajeFaltantes" debe describir solo lo que falta (ej: "Faltan la fecha del viaje y el teléfono." o "Ya tengo todo, solo confirmá si querés agregar algo más." si no falta nada).`;

/** Claves que el cliente espera en datos (camelCase). */
const DATOS_RESPONSE_KEYS = [
  "tipoViaje", "fechaViaje", "horaViaje",
  "origenCalle", "origenAltura", "origenLocalidad",
  "destinoCalle", "destinoAltura", "destinoLocalidad",
  "pasajeroNombre", "pasajeroTelefono",
  "idaYVuelta", "conEspera", "esRecurrente",
  "centroCostos", "idViaje", "solicitadoPor", "notas",
] as const;

/** Convierte datos normalizados a un objeto con claves exactas para el cliente. */
function toResponseDatos(normalized: DatosExtraidos): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of DATOS_RESPONSE_KEYS) {
    const val = normalized[key as keyof DatosExtraidos];
    if (val !== undefined && val !== null && (typeof val !== "string" || val.trim() !== "")) {
      out[key] = typeof val === "string" ? val.trim() : val;
    }
  }
  return out;
}

export async function POST(request: Request) {
  console.log("[interpretar-reserva] ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "definida" : "undefined");
  try {
    const body = await request.json();
    const texto =
      typeof body?.texto === "string" ? body.texto.trim() : "";

    if (!texto) {
      return NextResponse.json(
        { error: "Se requiere el campo 'texto'." },
        { status: 400 },
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY no configurada." },
        { status: 500 },
      );
    }

    let response: Awaited<ReturnType<InstanceType<typeof Anthropic>["messages"]["create"]>>;
    try {
      const anthropic = new Anthropic({ apiKey });
      response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Extrae los datos de esta solicitud de reserva:\n\n"${texto}"`,
        },
      ],
    });
    } catch (anthropicError: unknown) {
      const err = anthropicError as Error & { status?: number; error?: unknown };
      console.error("[interpretar-reserva] Error Anthropic:", err);
      return NextResponse.json(
        {
          error: "Error al llamar a Anthropic.",
          debug: {
            message: err?.message,
            name: err?.name,
            status: err?.status,
            error: err?.error,
          },
        },
        { status: 502 },
      );
    }

    const textContent = response.content.find((c) => c.type === "text");
    const rawText =
      textContent && "text" in textContent ? textContent.text : "";

    let parsed: {
      datos: DatosExtraidos;
      camposFaltantes: string[];
      mensajeFaltantes: string;
    };
    try {
      const cleaned = rawText.replace(/```json?\s*|\s*```/g, "").trim();
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch {
      return NextResponse.json(
        {
          error: "No se pudo interpretar la respuesta del asistente.",
          raw: rawText.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const rawDatos =
      parsed.datos && typeof parsed.datos === "object"
        ? (parsed.datos as Record<string, unknown>)
        : {};
    const datosNormalized = normalizeDatos(rawDatos);
    const datos = toResponseDatos(datosNormalized);
    const camposFaltantes = (REQUIRED_FIELDS as readonly string[]).filter((k) =>
      isEmpty(datosNormalized[k as keyof DatosExtraidos]),
    );
    const mensajeFaltantes =
      typeof parsed.mensajeFaltantes === "string" && parsed.mensajeFaltantes.trim()
        ? parsed.mensajeFaltantes.trim()
        : camposFaltantes.length > 0
          ? `Para completar la reserva faltan: ${camposFaltantes.join(", ")}.`
          : "Ya tengo todos los datos obligatorios. Te voy a preguntar por el resto.";

    return NextResponse.json({
      datos,
      camposFaltantes,
      mensajeFaltantes,
    });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    console.error("[interpretar-reserva]", err);
    return NextResponse.json(
      {
        error: "Error al interpretar el mensaje.",
        debug: {
          message: e?.message,
          name: e?.name,
          status: e?.status,
        },
      },
      { status: 500 },
    );
  }
}
