import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 60;

type HistorialMensaje = { role: "user" | "assistant"; content: string };

type ConfigCampos = {
  id_viaje?: boolean;
  centro_costos?: boolean;
  solicitado_por?: boolean;
};

type DatosReserva = Partial<{
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
  diasRecurrente: string[];
  horaRecurrente: string;
  fechaInicioRecurrente: string;
  fechaFinRecurrente: string;
  centroCostos: string;
  idViaje: string;
  solicitadoPor: string;
  notas: string;
  tieneParadas: boolean;
}>;

function buildSystemPrompt(configCampos: ConfigCampos | null): string {
  const camposObligatoriosCliente: string[] = [];
  if (configCampos?.centro_costos) camposObligatoriosCliente.push("Centro de costos");
  if (configCampos?.id_viaje) camposObligatoriosCliente.push("ID de viaje");
  if (configCampos?.solicitado_por) camposObligatoriosCliente.push("Solicitado por (nombre de quien solicita)");

  const camposClienteTexto =
    camposObligatoriosCliente.length > 0
      ? `Para este cliente también son obligatorios: ${camposObligatoriosCliente.join(", ")}.`
      : "Para este cliente no hay campos adicionales obligatorios.";

  return `Sos un asistente de reservas de remises corporativos. Tu rol es ayudar al usuario a completar una reserva de traslado de forma conversacional, amable y eficiente. Respondé siempre en español argentino (usá vos, dale, etc.). No uses la palabra "che" en ninguna respuesta.

DATOS OBLIGATORIOS para completar la reserva:
- Tipo de viaje (pasajero o mensajería)
- Fecha del viaje (formato YYYY-MM-DD)
- Hora del viaje (formato HH:MM en 24 hs)
- Origen: calle, altura y localidad
- Destino: calle, altura y localidad
- Nombre del pasajero (no obligatorio si es mensajería)
- Teléfono de contacto
${camposClienteTexto}

REGLAS DE COMPORTAMIENTO:
1. Si el usuario ya dio varios datos en un mensaje, extraelos todos y pedí solo lo que falta.
2. No repitas preguntas de datos que ya te dieron. Confirmá lo que entendiste.
3. Si el usuario dice "mañana", calculá la fecha. Hoy es ${new Date().toLocaleDateString("es-AR")}.
4. Hora: normalizá siempre a HH:MM en 24 hs ("las 9" → "09:00", "6pm" → "18:00", "18:00 hs" → "18:00").
5. Fecha: normalizá siempre a YYYY-MM-DD.
6. Direcciones: separar calle, altura y localidad ("Austria 2247 CABA" → calle: Austria, altura: 2247, localidad: CABA).
7. Si menciona datos de facturación (CUIT, razón social, etc.), guardalos en notas.
8. Si no menciona ida y vuelta, con espera o recurrente, asumir que NO.
9. Si no menciona paradas intermedias, no preguntes.
10. Si es mensajería (menciona paquete, documentación, sobre, encomienda, mercadería), no pidas nombre del pasajero.
11. Cuando tengas TODOS los datos obligatorios, resumís la reserva y preguntás si confirma.
12. Respondé de forma natural, breve y amable. No hagas listas largas. Pedí de a uno o dos campos a la vez.
13. NUNCA mencionés botones ni opciones numeradas. Todo es conversacional: el usuario responde con texto libre.
14. Cuando ya mostraste el resumen y el usuario responde:
    - Si confirma (dice "sí", "confirmo", "dale", "ok", "listo", etc.): poné accion: "confirmar"
    - Si quiere cancelar (dice claramente "cancelar", "no quiero", "dejalo", etc.): poné accion: "cancelar_solicitado" y preguntale si está seguro
    - Si pide un cambio o corrección (dice "no, el teléfono es...", "cambiá la hora", "el destino está mal", etc.): actualizá los datos con la corrección, poné accion: "modificar", reservaCompleta: true, y mostrá el resumen actualizado pidiendo confirmación nuevamente
    - NUNCA canceles directamente sin pedirle confirmación al usuario primero

FORMATO DE TU RESPUESTA:
CRÍTICO: Respondé SIEMPRE y ÚNICAMENTE con un objeto JSON válido. NUNCA escribas texto fuera del JSON. NUNCA uses markdown. NUNCA empieces con palabras como "Listo", "Perfecto", "Claro", etc. Tu respuesta COMPLETA debe ser el JSON.

Formato exacto:
{"message":"texto para el usuario","reservaCompleta":false,"accion":null,"datos":{"tipoViaje":null,"fechaViaje":null,"horaViaje":null,"origenCalle":null,"origenAltura":null,"origenLocalidad":null,"destinoCalle":null,"destinoAltura":null,"destinoLocalidad":null,"pasajeroNombre":null,"pasajeroTelefono":null,"idaYVuelta":"NO","conEspera":"NO","esRecurrente":"NO","centroCostos":null,"idViaje":null,"solicitadoPor":null,"notas":null,"tieneParadas":false}}

EJEMPLO de respuesta cuando el usuario pide una modificación (ej: "el nombre es Juan Reas"):
{"message":"Actualicé el nombre a Juan Reas. Resumen:\n• Tipo: Pasajero\n• Fecha: 28/02/2026\n• Hora: 18:00\n• Origen: Austria 2247, CABA\n• Destino: Dr. Bernardo Houssay 1562, Pilar\n• Pasajero: Juan Reas\n• Teléfono: 87374744\n¿Confirmás que está todo bien?","reservaCompleta":true,"accion":"modificar","datos":{"tipoViaje":"pasajero","fechaViaje":"2026-02-28","horaViaje":"18:00","origenCalle":"Austria","origenAltura":"2247","origenLocalidad":"CABA","destinoCalle":"Dr. Bernardo Houssay","destinoAltura":"1562","destinoLocalidad":"Pilar","pasajeroNombre":"Juan Reas","pasajeroTelefono":"87374744","idaYVuelta":"NO","conEspera":"NO","esRecurrente":"NO","centroCostos":null,"idViaje":null,"solicitadoPor":null,"notas":null,"tieneParadas":false}}

Reglas del campo "accion":
- null: todavía recopilando datos
- "confirmar": el usuario confirmó explícitamente la reserva
- "modificar": el usuario pidió un cambio; actualizaste los datos y mostrás el resumen corregido
- "cancelar_solicitado": el usuario quiere cancelar; preguntale si está seguro (nunca canceles sin confirmación)

Cuando tengas todos los datos obligatorios, poné reservaCompleta: true y en "message" escribí el resumen completo de la reserva pidiendo confirmación.`;
}

function isEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === "string") return !val.trim();
  return false;
}

function getRequiredFields(configCampos: ConfigCampos | null): string[] {
  const base = [
    "tipoViaje", "fechaViaje", "horaViaje",
    "origenCalle", "origenAltura", "origenLocalidad",
    "destinoCalle", "destinoAltura", "destinoLocalidad",
    "pasajeroTelefono",
  ];
  if (configCampos?.centro_costos) base.push("centroCostos");
  if (configCampos?.id_viaje) base.push("idViaje");
  if (configCampos?.solicitado_por) base.push("solicitadoPor");
  return base;
}

function isReservaCompleta(datos: DatosReserva, configCampos: ConfigCampos | null): boolean {
  const required = getRequiredFields(configCampos);
  if (datos.tipoViaje !== "mensajeria" && !required.includes("pasajeroNombre")) {
    required.push("pasajeroNombre");
  }
  return required.every((k) => !isEmpty(datos[k as keyof DatosReserva]));
}

export async function POST(request: Request) {
  console.log("[chat-reserva] ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "definida" : "undefined");
  try {
    const body = await request.json();
    const historial: HistorialMensaje[] = Array.isArray(body?.historial) ? body.historial : [];
    const mensajeNuevo: string = typeof body?.mensaje === "string" ? body.mensaje.trim() : "";
    const configCampos: ConfigCampos | null = body?.configCampos ?? null;

    if (!mensajeNuevo) {
      return NextResponse.json({ error: "Se requiere 'mensaje'." }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada." }, { status: 500 });
    }

    const mensajesParaClaude: Anthropic.MessageParam[] = [
      ...historial.map((m) => ({ role: m.role, content: m.content } as Anthropic.MessageParam)),
      { role: "user", content: mensajeNuevo },
    ];

    let response: Awaited<ReturnType<InstanceType<typeof Anthropic>["messages"]["create"]>>;
    try {
      const anthropic = new Anthropic({ apiKey });
      response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: buildSystemPrompt(configCampos),
        messages: mensajesParaClaude,
      });
    } catch (anthropicError: unknown) {
      const err = anthropicError as Error & { status?: number; error?: unknown };
      console.error("[chat-reserva] Error Anthropic:", err);
      return NextResponse.json(
        { error: "Error al llamar a Anthropic.", debug: { message: err?.message, status: err?.status } },
        { status: 502 },
      );
    }

    const textContent = response.content.find((c) => c.type === "text");
    const rawText = textContent && "text" in textContent ? textContent.text : "";

    let parsed: { message: string; reservaCompleta: boolean; accion?: string | null; datos: DatosReserva };

    /** Escapa saltos de línea literales dentro de strings JSON (Claude a veces los escribe sin escapar). */
    function sanitizeJsonStrings(text: string): string {
      return text.replace(/"(?:[^"\\]|\\.)*"/g, (match) =>
        match.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t"),
      );
    }

    /** Intenta parsear con múltiples estrategias. Lanza si todas fallan. */
    function tryParse(text: string): typeof parsed {
      // 1. Parse directo
      try { return JSON.parse(text) as typeof parsed; } catch { /* continuar */ }
      // 2. Escapar saltos de línea dentro de strings
      try { return JSON.parse(sanitizeJsonStrings(text)) as typeof parsed; } catch { /* continuar */ }
      // 3. Buscar el primer '{' (texto libre antes del JSON)
      const jsonStart = text.indexOf("{");
      if (jsonStart > 0) {
        const slice = text.slice(jsonStart);
        try { return JSON.parse(slice) as typeof parsed; } catch { /* continuar */ }
        try { return JSON.parse(sanitizeJsonStrings(slice)) as typeof parsed; } catch { /* continuar */ }
      }
      throw new Error("no parseable JSON found");
    }

    try {
      const cleaned = rawText.replace(/```json?\s*|\s*```/g, "").trim();
      parsed = tryParse(cleaned);
    } catch {
      console.error("[chat-reserva] No se pudo parsear JSON. Raw:", rawText.slice(0, 300));
      // Último fallback: usar el texto plano como mensaje (sin mostrar el JSON crudo)
      const fallbackText = rawText.trim();
      if (fallbackText.length > 0) {
        // Si el texto empieza con '{', es JSON inválido — no lo mostramos al usuario
        const displayText = fallbackText.startsWith("{")
          ? "Hubo un problema al interpretar la respuesta. ¿Podés repetir tu mensaje?"
          : fallbackText;
        return NextResponse.json({
          message: displayText,
          reservaCompleta: false,
          accion: null,
          datos: {},
        });
      }
      return NextResponse.json(
        { error: "No se pudo interpretar la respuesta.", raw: rawText.slice(0, 500) },
        { status: 502 },
      );
    }

    const datos: DatosReserva = parsed.datos ?? {};
    const reservaCompleta = parsed.accion === "confirmar"
      ? true
      : isReservaCompleta(datos, configCampos) && parsed.reservaCompleta;

    return NextResponse.json({
      message: parsed.message ?? "No entendí tu respuesta. ¿Podés repetirlo?",
      reservaCompleta,
      accion: parsed.accion ?? null,
      datos,
    });
  } catch (err: unknown) {
    const e = err as Error;
    console.error("[chat-reserva]", err);
    return NextResponse.json(
      { error: "Error interno.", debug: { message: e?.message } },
      { status: 500 },
    );
  }
}
