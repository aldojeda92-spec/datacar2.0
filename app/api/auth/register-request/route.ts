import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { nombre, cargo, concesionaria, marcas, telefono, email, password } = body || {};

    if (!email || !password || !nombre || !concesionaria) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios para registrar la solicitud.' },
        { status: 400 }
      );
    }

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres.' },
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

    // Crear el usuario directamente en Firebase Authentication mediante Identity Toolkit REST API
    const authRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: nombre.trim(),
          returnSecureToken: true,
        }),
      }
    );

    const authData = await authRes.json();

    if (!authRes.ok) {
      const errMsg = authData?.error?.message || 'Error desconocido al registrar usuario';
      if (errMsg === 'EMAIL_EXISTS') {
        return NextResponse.json(
          {
            error: 'EMAIL_EXISTS',
            message: 'El correo electrónico ya se encuentra registrado en el sistema. Si ya tienes cuenta, podés iniciar sesión o solicitar soporte.',
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: errMsg, message: 'No se pudo crear la cuenta en el servicio de autenticación.' },
        { status: 400 }
      );
    }

    const uid = authData.localId;

    return NextResponse.json({
      success: true,
      uid,
      email: authData.email,
    });
  } catch (error: any) {
    console.error('Error en /api/auth/register-request:', error);
    return NextResponse.json(
      { error: error?.message || 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
