// app/components/SimpleFooter.tsx
// Footer "Suscribite a las oportunidades" + newsletter, usado en calculadora y
// negociamos-por-vos. Antes duplicado palabra por palabra salvo el disclaimer final.
import NewsletterForm from './NewsletterForm';

export default function SimpleFooter({ disclaimer }: { disclaimer: string }) {
  return (
    <footer className="w-full bg-[#0A1F33] border-t-4 border-[#00BFFF] text-[#FFFFFF] mt-auto" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-16 flex flex-col md:flex-row justify-between items-center gap-12 border-b border-[#FFFFFF]/10">
        <div className="md:w-1/2 text-center md:text-left">
          <h3 className="font-black text-3xl md:text-4xl text-[#FFFFFF] uppercase mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>Suscribite a las oportunidades.</h3>
          <p className="text-sm text-[#C0C0C0] font-medium">Sé el primero en enterarte de las mejores opciones de 0km, variaciones de precios y preventas.</p>
        </div>
        <div className="md:w-1/2 w-full max-w-lg">
          <NewsletterForm />
        </div>
      </div>
      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-6">
        <p className="text-[10px] text-[#C0C0C0]/60 font-medium text-center md:text-left leading-relaxed">
          © {new Date().getFullYear()} {disclaimer}
        </p>
      </div>
    </footer>
  );
}
