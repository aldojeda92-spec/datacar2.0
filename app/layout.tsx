import type { Metadata } from "next";
import { Montserrat, Inter } from "next/font/google";
import "./globals.css";
import { LeadProvider } from "./context/LeadContext"; // Inyección del contexto global
import { ToastProvider } from "./context/ToastContext";

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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','GTM-52KCG6F3');`
          }}
        />
      </head>
      <body className={`${montserrat.variable} ${inter.variable} font-inter bg-white text-dataCharcoal antialiased selection:bg-digitalCyan selection:text-authorityBlue`}>
        <noscript>
          <iframe 
            src="https://www.googletagmanager.com/ns.html?id=GTM-52KCG6F3"
            height="0" 
            width="0" 
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        
        {/* El Provider envuelve toda la app, inyectando el Modal una sola vez en el DOM */}
        <ToastProvider>
          <LeadProvider>
            {children}
          </LeadProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
