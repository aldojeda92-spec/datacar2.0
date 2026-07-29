import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
  console.log("🚀 [API MAIL] Solicitud de envío recibida en el servidor.");
  
  try {
    const body = await request.json();
    const { destinatarios, subject, html } = body;

    if (!destinatarios || destinatarios.length === 0) {
      console.error("❌ [API MAIL] Fallo: No hay destinatarios.");
      return NextResponse.json({ error: 'Faltan destinatarios' }, { status: 400 });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error("❌ [API MAIL] Fallo: Credenciales .env.local ausentes.");
      return NextResponse.json({ error: 'Credenciales SMTP ausentes' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"DATACAR CRM" <${process.env.EMAIL_USER}>`,
      to: destinatarios.join(', '),
      subject: subject,
      html: html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ [API MAIL] Éxito. Correo despachado. ID:", info.messageId);

    return NextResponse.json({ success: true, message: 'Correo enviado.' });

  } catch (error: any) {
    console.error('❌ [API MAIL] Error crítico de SMTP:', error);
    return NextResponse.json({ error: 'Error interno', details: error.message }, { status: 500 });
  }
}