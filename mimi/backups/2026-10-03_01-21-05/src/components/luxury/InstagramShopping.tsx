"use client";

import { Instagram, ExternalLink, Heart, ShoppingBag } from "lucide-react";
import { useStore } from "@/lib/stores-combined";
import SkeletonImage from "./SkeletonImage";

/**
 * Integração Instagram Shopping.
 * Mostra feed do Instagram + tags de produtos.
 * Link para perfil @mimimimos (configurável no admin).
 *
 * As imagens são puxadas DINAMICAMENTE do store de produtos pelo código,
 * evitando 404s quando um produto não tem imagem local cadastrada.
 */

const INSTAGRAM_PROFILE = "https://instagram.com/mimi.mimostore";

interface IgPost {
  id: string;
  productCode: string; // ex: "#001", "DEC-05", "AF-03"
  caption: string;
  likes: number;
}

const INSTAGRAM_POSTS: IgPost[] = [
  { id: "ig-1", productCode: "#001", caption: "Allure Homme Sport — frescor que dura o dia todo ✨", likes: 234 },
  { id: "ig-2", productCode: "#126", caption: "Good Girl Stiletto — ousadia em cada borrifada 👠", likes: 412 },
  { id: "ig-3", productCode: "DEC-05", caption: "Khamrah — canela e tâmara para noites memoráveis 🌙", likes: 567 },
  { id: "ig-4", productCode: "#247", caption: "Baccarat Rouge 540 — o luxo em estado puro 💎", likes: 689 },
  { id: "ig-5", productCode: "AF-03", caption: "Yara Pink — marshmallow e frutas tropicais 🌸", likes: 345 },
  { id: "ig-6", productCode: "DEC-07", caption: "Odyssey Dubai Chocolat — chocolate amargo irresistível 🍫", likes: 423 },
];

export default function InstagramShopping() {
  const products = useStore((s) => s.products);

  const openQuickView = (productCode: string) => {
    const product = products.find((p) => p.code === productCode);
    if (product) {
      // Use SlideIn drawer (right-side panel) for better UX
      window.dispatchEvent(
        new CustomEvent("openSlideIn", { detail: product })
      );
    }
  };

  // Helper: puxa imagem dinamicamente do produto pelo código
  const getImageForPost = (code: string): string => {
    const product = products.find((p) => p.code === code);
    return product?.image || "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/upload_images/bc-005.webp"; // fallback seguro (GitHub)
  };

  return (
    <section
      id="instagramSection"
      className="py-12 px-4 sm:px-8 max-w-7xl mx-auto border-t border-gold-500/10 scroll-mt-20"
    >
      <div className="text-center mb-8">
        <span className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-pink-500/30 bg-pink-500/10 text-pink-300 text-xs font-medium uppercase tracking-widest mb-3">
          <Instagram className="text-pink-400" size={14} />
          @mimi.mimostore no Instagram
        </span>
        <h3 className="font-serif-luxury text-3xl font-bold text-white mb-2">
          Instagram Shopping
        </h3>
        <p className="text-xs text-gray-400 max-w-2xl mx-auto">
          Toque em qualquer foto para ver o perfume e comprar direto. Cada post
          tem um produto taggeado com preço e detalhes.
        </p>
      </div>

      {/* Grid de posts do Instagram */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {INSTAGRAM_POSTS.map((post, idx) => {
          const img = getImageForPost(post.productCode);
          return (
            <button
              key={post.id}
              onClick={() => openQuickView(post.productCode)}
              className="relative group overflow-hidden rounded-xl aspect-square border border-gold-500/15 hover:border-gold-400/50 transition-all"
              style={{
                animation: `igFadeIn 0.5s ease-out ${idx * 0.06}s both`,
              }}
            >
              <SkeletonImage
                src={img}
                alt={post.caption}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
              />
              {/* Overlay com info do produto */}
              <div className="absolute inset-0 bg-gradient-to-t from-obsidian-950/90 via-obsidian-950/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                <span className="text-[9px] uppercase tracking-wider font-bold text-gold-300">
                  {post.productCode}
                </span>
                <p className="text-[9px] text-gray-200 line-clamp-2 leading-tight">
                  {post.caption}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-0.5 text-[9px] text-pink-300">
                    <Heart size={9} className="fill-pink-400" />
                    {post.likes}
                  </span>
                  <span className="flex items-center gap-0.5 text-[9px] text-gold-300">
                    <ShoppingBag size={9} />
                    Comprar
                  </span>
                </div>
              </div>
              {/* Badge Instagram */}
              <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                <Instagram size={12} className="text-white" />
              </div>
              {/* Indicador "tagged" no canto inferior esquerdo */}
              <div className="absolute bottom-1.5 left-1.5 w-2 h-2 rounded-full bg-pink-500 ring-2 ring-white/80 opacity-90 group-hover:opacity-0 transition-opacity" />
            </button>
          );
        })}
      </div>

      {/* CTA seguir no Instagram */}
      <div className="mt-6 text-center">
        <a
          href={INSTAGRAM_PROFILE}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-white font-bold text-xs uppercase tracking-widest hover:scale-105 transition-transform"
        >
          <Instagram size={16} />
          Seguir @mimi.mimostore
          <ExternalLink size={12} />
        </a>
        <p className="text-[10px] text-gray-500 mt-2">
          Posts diários com novidades, dicas de layering e bastidores da curadoria
        </p>
      </div>

      {/* Estilos de animação inline */}
      <style>{`
        @keyframes igFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </section>
  );
}
