// app/components/LegalFooter.tsx
// Footer simple usado en páginas legales (términos, privacidad). Antes duplicado
// byte a byte en ambos archivos.
export default function LegalFooter() {
  return (
    <footer className="w-full bg-[#0A1F33] border-t-4 border-[#00BFFF] py-12 px-4 text-center mt-auto">
      <div className="max-w-[800px] mx-auto flex flex-col items-center">
        <div className="font-black text-2xl tracking-widest text-[#FFFFFF] uppercase mb-6" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          DATA<span className="font-light">CAR</span>
        </div>
        <p className="text-[10px] text-[#C0C0C0] uppercase tracking-widest font-medium">
          © {new Date().getFullYear()} DATACAR. Inteligencia de Mercado Automotriz en Paraguay.
        </p>
      </div>
    </footer>
  );
}
