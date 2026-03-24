import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseServer } from "@/lib/supabaseServer";

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail =
  (process.env.RESEND_FROM_EMAIL ?? "noreply@remises.com") as string;

if (!resendApiKey) {
  throw new Error("RESEND_API_KEY is not set in environment variables.");
}

const resend = new Resend(resendApiKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reservaId =
      typeof body?.reservaId === "string" || typeof body?.reservaId === "number"
        ? String(body.reservaId).trim()
        : "";
    const numeroReservaOk = typeof body?.numero_reserva_ok === "string" ? body.numero_reserva_ok.trim() : null;
    const chofer = typeof body?.chofer === "string" ? body.chofer.trim() || null : null;
    const archivoUrl = typeof body?.archivo_url === "string" ? body.archivo_url.trim() || null : null;

    if (!reservaId) {
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

    // Actualizar estado + campos nuevos en un solo update
    const { error: updateError } = await supabaseServer
      .from("reservas")
      .update({
        estado: "confirmada",
        ...(numeroReservaOk !== null && { numero_reserva_ok: numeroReservaOk }),
        ...(chofer !== null && { chofer }),
        ...(archivoUrl !== null && { archivo_url: archivoUrl }),
      })
      .eq("id", reservaId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    const destinatario = reserva.mail_solicitante as string | null;

    if (!destinatario) {
      return NextResponse.json(
        { error: "La reserva no tiene email de solicitante." },
        { status: 400 },
      );
    }

    const fecha = reserva.fecha_viaje ?? "-";
    const hora = reserva.hora_viaje ?? "-";

    const origen = `${reserva.origen_calle ?? ""} ${reserva.origen_altura ?? ""} - ${reserva.origen_localidad ?? ""}`.trim();
    const destino = `${reserva.destino_calle ?? ""} ${reserva.destino_altura ?? ""} - ${reserva.destino_localidad ?? ""}`.trim();

    const numeroReserva = numeroReservaOk ?? reserva.id_viaje ?? `RES-${reserva.id}`;
    const choferTexto = chofer ?? (reserva.chofer as string | null) ?? null;

    const subject = `Reserva confirmada - ${numeroReserva}`;
    const textContent = `Tu reserva ha sido confirmada.\n\nNúmero de reserva: ${numeroReserva}\nFecha: ${fecha}\nHora: ${hora}\nOrigen: ${origen}\nDestino: ${destino}${choferTexto ? `\nChofer: ${choferTexto}` : ""}\n`;

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
          ${choferTexto ? `<li><strong>Chofer:</strong> ${choferTexto}</li>` : ""}
        </ul>
        <p style="margin: 0;">Ante cualquier cambio o consulta, contactate con el área de transporte.</p>
      </div>
    `;

    // Si hay archivo adjunto, descargarlo desde Supabase Storage
    type ResendAttachment = { filename: string; content: string; contentType: string };
    const attachments: ResendAttachment[] = [];
    const efectivoArchivoUrl = archivoUrl ?? (reserva.archivo_url as string | null);
    if (efectivoArchivoUrl) {
      try {
        // Extraer el path relativo dentro del bucket
        const bucketName = "archivos-reservas";
        const marker = `/${bucketName}/`;
        const idx = efectivoArchivoUrl.indexOf(marker);
        const filePath = idx !== -1 ? efectivoArchivoUrl.slice(idx + marker.length) : null;

        if (filePath) {
          const { data: fileData, error: downloadError } = await supabaseServer.storage
            .from(bucketName)
            .download(filePath);

          if (!downloadError && fileData) {
            const arrayBuffer = await fileData.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString("base64");
            const fileName = filePath.split("/").pop() ?? "adjunto";
            // Quitar el prefijo reservaId- del nombre para mostrarlo limpio
            const displayName = fileName.replace(/^\d+-/, "");
            attachments.push({
              filename: displayName,
              content: base64,
              contentType: fileData.type || "application/octet-stream",
            });
          }
        }
      } catch {
        // Si falla la descarga del archivo, enviamos el email igual sin adjunto
      }
    }

    const { error: emailError } = await resend.emails.send({
      from: resendFromEmail,
      to: destinatario,
      subject,
      text: textContent,
      html: htmlContent,
      ...(attachments.length > 0 && { attachments }),
    });

    if (emailError) {
      return NextResponse.json(
        { error: emailError.message ?? "Error al enviar el email." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: (error as Error)?.message ?? "Error inesperado." },
      { status: 500 },
    );
  }
}
