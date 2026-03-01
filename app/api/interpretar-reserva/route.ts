import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 30;

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

REGLAS DE EXTRACCIÓN:

1. TIPO DE VIAJE: Si menciona "paquete", "documentación", "sobre", "mensajería", "encomienda", "mercadería", asumí tipoViaje = "mensajeria". Sino, "pasajero".

2. FECHA:
- Fechas explícitas (DD/MM, DD/MM/YYYY, "15 de marzo"): normalizá a YYYY-MM-DD
- Si hay día de semana + número de día + mes, es fecha explícita
- Si la fecha no está clara o no se menciona, dejar fechaViaje en null

3. HORA: Normalizá SIEMPRE a HH:MM en formato 24hs. Ejemplos: "9 de la mañana" → "09:00", "18:00 hs" → "18:00", "6pm" → "18:00", "las 9" → "09:00"

4. DIRECCIONES: Separar calle, altura y localidad cuando sea posible. "Austria 2247 CABA" → calle: "Austria", altura: "2247", localidad: "CABA"

5. PASAJERO: Si es mensajería, el nombre del pasajero no es obligatorio.

6. CAMPOS FALTANTES: Solo marcar como faltante lo que realmente NO aparece ni se puede inferir. Si un campo tiene valor, NO incluirlo en camposFaltantes.

7. CON ESPERA: Si menciona "con espera", "esperar", "volver a buscar", marcá conEspera = "SI". Si no se menciona explícitamente, asumir "NO".

8. IDA Y VUELTA: Si menciona explícitamente "ida y vuelta", "ir y volver", marcá idaYVuelta = "SI". Si no se menciona explícitamente, asumir "NO".

9. RECURRENTE: Si menciona explícitamente "recurrente", "todos los días", "semanal", etc., marcá esRecurrente = "SI". Si no se menciona explícitamente, asumir "NO".

FORMATO DE SALIDA: Devolvé ÚNICAMENTE un JSON válido, sin markdown ni texto adicional, con esta estructura (claves en camelCase):

{
  "datos": {
    "tipoViaje": "pasajero" o "mensajeria",
    "fechaViaje": "YYYY-MM-DD" o null,
    "horaViaje": "HH:MM" en 24h sin sufijos (ej: "09:00", "18:00") o null,
    "origenCalle": string o null,
    "origenAltura": string o null,
    "origenLocalidad": string o null,
    "destinoCalle": string o null,
    "destinoAltura": string o null,
    "destinoLocalidad": string o null,
    "pasajeroNombre": string o null,
    "pasajeroTelefono": string o null,
    "idaYVuelta": "SI" si se menciona ida y vuelta; si no se menciona, "NO" (nunca null),
    "conEspera": "SI" si se menciona espera; si no se menciona, "NO" (nunca null),
    "esRecurrente": "SI" si se menciona recurrente; si no se menciona, "NO" (nunca null),
    "centroCostos": string o null,
    "idViaje": string o null,
    "solicitadoPor": string o null,
    "notas": string o null
  },
  "camposFaltantes": ["solo claves camelCase de datos que están null o vacíos y son obligatorios"],
  "mensajeFaltantes": "Frase amigable indicando SOLO lo que falta, en español."
}`;

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
      model: "claude-haiku-4-5-20251001",
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
