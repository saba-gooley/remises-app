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

const SYSTEM_PROMPT = `Eres un asistente que interpreta mensajes en español para extraer datos de una reserva de remis/traslado.
El usuario escribe en texto libre (ej: "necesito un remis mañana a las 9 de Corrientes 1234 CABA a Libertador 5678 para Juan, teléfono 1134567890").
Debes extraer los campos de la reserva y devolver ÚNICAMENTE un JSON válido, sin markdown ni texto adicional, con esta estructura exacta:

{
  "datos": {
    "tipoViaje": "pasajero" o "mensajeria" (si no se menciona, "pasajero"),
    "fechaViaje": "YYYY-MM-DD" (inferir "mañana", "pasado mañana", "el 15/03" etc.; si no se puede, null),
    "horaViaje": "HH:MM" en 24h (ej: "09:00", "14:30"; convertir "9 de la mañana" a "09:00"),
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
  "camposFaltantes": ["nombreDelCampo", ...],
  "mensajeFaltantes": "Frase amigable indicando qué datos faltan para completar la reserva, en español."
}

Reglas:
- Fechas siempre en YYYY-MM-DD. Si el usuario dice "mañana" usa la fecha de mañana.
- Horas siempre en HH:MM (24 horas).
- Los campos no extraíbles van en null en "datos".
- En "camposFaltantes" lista las claves de "datos" que están null o vacías y que son necesarias para una reserva (origen, destino, fecha, hora, pasajero, teléfono).
- "mensajeFaltantes" debe ser una sola oración o dos, clara para el usuario (ej: "Para completar la reserva necesito la fecha del viaje y el teléfono de contacto.").`;

export async function POST(request: Request) {
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

    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
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

    if (!parsed.datos || typeof parsed.datos !== "object") {
      parsed = {
        datos: {},
        camposFaltantes: [...REQUIRED_FIELDS],
        mensajeFaltantes:
          "No pude extraer los datos. Por favor indicá origen, destino, fecha, hora, nombre del pasajero y teléfono.",
      };
    }

    const datos = parsed.datos as DatosExtraidos;
    const camposFaltantes =
      Array.isArray(parsed.camposFaltantes) && parsed.camposFaltantes.length > 0
        ? parsed.camposFaltantes
        : (REQUIRED_FIELDS as readonly string[]).filter(
            (k) => !datos[k as keyof DatosExtraidos],
          );
    const mensajeFaltantes =
      typeof parsed.mensajeFaltantes === "string" && parsed.mensajeFaltantes
        ? parsed.mensajeFaltantes
        : "Para completar la reserva faltan algunos datos. Te los voy a pedir uno por uno.";

    return NextResponse.json({
      datos,
      camposFaltantes,
      mensajeFaltantes,
    });
  } catch (err) {
    console.error("[interpretar-reserva]", err);
    return NextResponse.json(
      { error: "Error al interpretar el mensaje." },
      { status: 500 },
    );
  }
}
