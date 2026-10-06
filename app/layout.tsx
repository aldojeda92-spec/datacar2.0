import type { Metadata } from "next";
import { Montserrat, Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { LeadProvider } from "./context/LeadContext"; // Inyección del contexto global
import { ToastProvider } from "./context/ToastContext";
import WhatsAppButton from "./components/WhatsAppButton";

// Configuración estricta según Manual de Marca.
// `display: 'swap'` + `adjustFontFallback` (default) generan un fallback con
// métricas ajustadas para minimizar el CLS mientras carga la webfont.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ['300', '900'],
  display: 'swap',
  variable: '--font-montserrat'
});

const inter = Inter({
  subsets: ["latin"],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-inter'
});

export const metadata: Metadata = {
  metadataBase: new URL('https://datacarpy.com'),
  title: {
    default: 'DATACAR | Precios 0KM, Cuotas y Comparador de Autos en Paraguay',
    template: '%s | DATACAR Paraguay',
  },
  description: 'Encontrá tu próximo 0KM en Paraguay: catálogo con precios actualizados, cálculo de cuotas corridas, entrega inicial, financiación y comparador técnico de todas las concesionarias oficiales.',
  keywords: [
    'autos 0km paraguay',
    'precios autos paraguay',
    'cuotas corridas',
    'entrega inicial auto',
    'financiacion vehiculos paraguay',
    'comparador de autos',
    'suv paraguay',
    'pick up paraguay',
    'datacar py',
    'datacar paraguay',
  ],
  authors: [{ name: 'DATACAR Paraguay' }],
  creator: 'DATACAR Paraguay',
  publisher: 'DATACAR Paraguay',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'es_PY',
    url: 'https://datacarpy.com',
    siteName: 'DATACAR Paraguay',
    title: 'DATACAR | Precios 0KM, Cuotas y Comparador de Autos en Paraguay',
    description: 'Encontrá tu próximo 0KM en Paraguay con precios de lista, cálculo de cuotas corridas y comparador técnico de todas las concesionarias oficiales.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DATACAR | Precios 0KM, Cuotas y Comparador de Autos en Paraguay',
    description: 'Encontrá tu próximo 0KM en Paraguay con precios actualizados, cálculo de cuotas y comparador técnico.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'AutoDealer',
      '@id': 'https://datacarpy.com/#organization',
      name: 'DATACAR Paraguay',
      url: 'https://datacarpy.com',
      description: 'Plataforma de comparación, cuotas y cotización de autos 0KM en Paraguay de todas las concesionarias oficiales.',
      areaServed: {
        '@type': 'Country',
        name: 'Paraguay',
      },
      sameAs: [
        'https://www.instagram.com/datacarpy/',
        'https://tiktok.com/@datacar.paraguay',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': 'https://datacarpy.com/#website',
      url: 'https://datacarpy.com',
      name: 'DATACAR Paraguay',
      description: 'Catálogo 0KM, cuotas y comparador de vehículos en Paraguay',
      publisher: { '@id': 'https://datacarpy.com/#organization' },
      inLanguage: 'es-PY',
    },
  ],
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
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className={`${montserrat.variable} ${inter.variable} font-inter bg-white text-dataCharcoal antialiased selection:bg-digitalCyan selection:text-authorityBlue`}>
        {/*
         * Analytics diferido con next/script (strategy="afterInteractive"): ya no
         * bloquea el render inicial ni compite por el hilo principal durante el
         * LCP/hidratación como cuando eran <script> crudos en <head>.
         */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-73EGE05S3W"
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-73EGE05S3W');
          `}
        </Script>
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','GTM-52KCG6F3');`}
        </Script>

        {/* GOOGLE TAG MANAGER (noscript) */}
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
        <WhatsAppButton />
      </body>
    </html>
  );
}
