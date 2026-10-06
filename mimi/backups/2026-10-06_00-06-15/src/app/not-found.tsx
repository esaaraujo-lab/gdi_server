import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center bg-obsidian-950">
      <div className="max-w-md w-full glass-panel-gold rounded-3xl p-8 border border-gold-500/40 shadow-2xl">
        <div className="w-20 h-20 rounded-full border-2 border-gold-500/50 flex items-center justify-center bg-obsidian-900/80 overflow-hidden mx-auto mb-6">
          <img
            src="/logo-bottle.png"
            alt="Mimi Mimos — frasco de perfume"
            className="w-full h-full object-cover"
          />
        </div>
        <p className="font-serif-luxury text-6xl font-bold gold-shimmer-text mb-2">
          404
        </p>
        <h1 className="font-serif-luxury text-2xl font-bold text-white mb-3">
          Página não encontrada
        </h1>
        <p className="text-xs text-gray-400 mb-6 leading-relaxed">
          A fragrância que você procura não está neste endereço. Talvez tenha
          sido descontinuada ou o link esteja incorreto.
        </p>
        <Link
          href="/"
          className="btn-gold px-8 py-3 rounded-full text-xs uppercase tracking-widest inline-flex items-center gap-2"
        >
          Voltar ao Catálogo
        </Link>
      </div>
    </div>
  );
}
