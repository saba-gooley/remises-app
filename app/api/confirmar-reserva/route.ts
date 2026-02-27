import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseServer } from "@/lib/supabaseServer";

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL;

if (!resendApiKey) {
  throw new Error("RESEND_API_KEY is not set in environment variables.");
}

if (!resendFromEmail) {
  throw new Error("RESEND_FROM_EMAIL is not set in environment variables.");
}

const resend = new Resend(resendApiKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reservaId = body?.reservaId as number | undefined;

    if (!reservaId || typeof reservaId !== "number") {
      return NextResponse.json(
        { error: "Parámetro 'reservaId' inválido." },
        { status: 400 },
      );
    }

    const { data: reserva, error: fetchError } = await supabaseServer
      .from("reservas")
      .select("*")
      .eq("id", reservaId)
      .single();

    if (fetchError || !reserva) {
      return NextResponse.json(
        { error: fetchError?.message ?? "Reserva no encontrada." },
        { status: 404 },
      );
    }

    const { error: updateError } = await supabaseServer
      .from("reservas")
      .update({ estado: "confirmada" })
      .eq("id", reservaId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    const destinatario = reserva.solicitado_por as string | null;

    if (!destinatario) {
      return NextResponse.json(
        { error: "La reserva no tiene email de solicitante." },
        { status: 400 },
      );
    }

    const fecha = reserva.fecha_hora
      ? new Date(reserva.fecha_hora).toLocaleDateString()
      : "-";
    const hora = reserva.fecha_hora
      ? new Date(reserva.fecha_hora).toLocaleTimeString()
      : "-";

    const origen = `${reserva.origen_calle ?? ""} ${
      reserva.origen_altura ?? ""
    } - ${reserva.origen_localidad ?? ""}`.trim();
    const destino = `${reserva.destino_calle ?? ""} ${
      reserva.destino_altura ?? ""
    } - ${reserva.destino_localidad ?? ""}`.trim();

    const numeroReserva = reserva.id_viaje ?? `RES-${reserva.id}`;

    const subject = `Reserva confirmada - ${numeroReserva}`;
    const textContent = `Tu reserva ha sido confirmada.

Número de reserva: ${numeroReserva}
Fecha: ${fecha}
Hora: ${hora}
Origen: ${origen}
Destino: ${destino}
`;

    const htmlContent = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #111827;">
        <h1 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Tu reserva fue confirmada</h1>
        <p style="margin: 0 0 12px 0;">Estos son los datos de tu viaje:</p>
        <ul style="margin: 0 0 12px 16px; padding: 0;">
          <li><strong>Número de reserva:</strong> ${numeroReserva}</li>
          <li><strong>Fecha:</strong> ${fecha}</li>
          <li><strong>Hora:</strong> ${hora}</li>
          <li><strong>Origen:</strong> ${origen}</li>
          <li><strong>Destino:</strong> ${destino}</li>
        </ul>
        <p style="margin: 0;">Ante cualquier cambio o consulta, contactate con el área de transporte.</p>
      </div>
    `;

    const { error: emailError } = await resend.emails.send({
      from: resendFromEmail,
      to: destinatario,
      subject,
      text: textContent,
      html: htmlContent,
    });

    if (emailError) {
      return NextResponse.json(
        { error: emailError.message ?? "Error al enviar el email." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Error inesperado." },
      { status: 500 },
    );
  }
}

