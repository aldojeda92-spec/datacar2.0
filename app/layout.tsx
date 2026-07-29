import type { Metadata } from "next";
import { Montserrat, Inter } from "next/font/google";
import "./globals.css";
import { LeadProvider } from "./context/LeadContext"; // Inyección del contexto global

// Configuración estricta según Manual de Marca
const montserrat = Montserrat({ 
  subsets: ["latin"],
  weight: ['300', '900'], 
  variable: '--font-montserrat'
});

const inter = Inter({ 
  subsets: ["latin"],
  weight: ['400', '500', '700'],
  variable: '--font-inter'
});

export const metadata: Metadata = {
  title: "Datacar | Inversiones Automotrices Inteligentes",
  description: "Datos duros y transparencia para tu próximo 0KM en Paraguay.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${montserrat.variable} ${inter.variable} font-inter bg-white text-dataCharcoal antialiased selection:bg-digitalCyan selection:text-authorityBlue`}>
        {/* El Provider envuelve toda la app, inyectando el Modal una sola vez en el DOM */}
        <LeadProvider>
          {children}
        </LeadProvider>
      </body>
    </html>
  );
}