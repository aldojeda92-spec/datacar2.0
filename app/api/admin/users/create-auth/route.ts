import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, nombre } = body || {};

    if (!email) {
      return NextResponse.json(
        { error: 'El email es obligatorio para crear el usuario.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Configuración de Firebase no disponible en el servidor.' },
        { status: 500 }
      );
    }

    // Si no se proporcionó contraseña, generar una aleatoria segura
    const finalPassword = password && password.length >= 6
      ? password
      : `Datacar${Math.floor(1000 + Math.random() * 9000)}!`;

    const authRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password: finalPassword,
          displayName: nombre ? nombre.trim() : undefined,
          returnSecureToken: true,
        }),
      }
    );

    const authData = await authRes.json();

    if (!authRes.ok) {
      const errMsg = authData?.error?.message || 'Error al crear usuario en Firebase Auth';
      return NextResponse.json(
        { error: errMsg, message: errMsg === 'EMAIL_EXISTS' ? 'El usuario ya existe en Firebase Auth.' : errMsg },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      uid: authData.localId,
      email: authData.email,
      temporaryPassword: finalPassword,
    });
  } catch (error: any) {
    console.error('Error en /api/admin/users/create-auth:', error);
    return NextResponse.json(
      { error: error?.message || 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
