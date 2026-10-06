import Logo from "./Logo";

export default function SiteFooter() {
  return (
    <footer className="lux-bg-deep border-t border-gold-500/15 py-10 px-4 text-center text-xs text-gray-500 space-y-5 mt-auto safe-bottom">
      {/* Logo — frasco + texto MIMI MIMOS (mesmo estilo do header) */}
      <div className="flex justify-center">
        <Logo size="lg" subtitle="PERFUME STORE" />
      </div>

      <p className="max-w-md mx-auto text-[11px] text-gray-400">
        Especialistas em perfumaria de bolso Brand Collection (25ml), Miniaturas
        Árabes Afeer e Decantes 5ml. Qualidade original, frasco idêntico e
        fixação prolongada.
      </p>
      <div className="flex flex-wrap justify-center gap-4 text-[10px] text-gray-500">
        <span>📦 Envio imediato</span>
        <span>🔒 Pagamento seguro via Pix</span>
        <span>💎 Essência concentrada 25%</span>
        <span>📱 WebApp instalável</span>
      </div>
      <div className="text-[10px] text-gray-600">
        © {new Date().getFullYear()} Mimi Mimos Parfumerie. Todos os direitos
        reservados.
      </div>
    </footer>
  );
}
