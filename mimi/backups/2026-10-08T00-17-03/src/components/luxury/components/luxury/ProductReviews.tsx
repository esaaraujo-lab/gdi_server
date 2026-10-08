"use client";

import { useState, useEffect } from "react";
import { useReviewStore } from "@/lib/review-store";
import type { Perfume } from "@/lib/perfumes";
import { Star, MessageSquare, Send, Trash2, User } from "lucide-react";
import { toast } from "sonner";

/**
 * Seção de avaliações de clientes — exibida no QuickViewModal.
 * Mostra:
 *  - Média de estrelas + contagem
 *  - Lista de reviews (nome, nota, comentário, data)
 *  - Formulário para adicionar review (nome + nota + comentário)
 */
export default function ProductReviews({ product }: { product: Perfume }) {
  const reviews = useReviewStore((s) => s.reviews);
  const addReview = useReviewStore((s) => s.addReview);
  const deleteReview = useReviewStore((s) => s.deleteReview);
  const syncReviewsFromD1 = useReviewStore((s) => s.syncReviewsFromD1);

  // D1 SYNC — fetch reviews for this product from D1 on mount.
  // localStorage cache renders instantly; D1 overwrites in the background
  // for cross-device consistency. Non-blocking, fails silently to fallback.
  useEffect(() => {
    void syncReviewsFromD1(product.id).catch((err) =>
      console.warn("[D1 sync] ProductReviews mount failed:", err)
    );
  }, [product.id, syncReviewsFromD1]);

  const productReviews = reviews
    .filter((r) => r.productId === product.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const avg =
    productReviews.length > 0
      ? productReviews.reduce((acc, r) => acc + r.rating, 0) /
        productReviews.length
      : 0;

  // Distribuição: quantas reviews tem 5,4,3,2,1 estrelas
  const dist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: productReviews.filter((r) => r.rating === star).length,
  }));
  const total = productReviews.length;

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [author, setAuthor] = useState("");
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      toast.error("Escreva um comentário sobre o perfume.");
      return;
    }
    if (comment.trim().length < 10) {
      toast.error("Comentário muito curto. Escreva ao menos 10 caracteres.");
      return;
    }
    addReview(product.id, author, rating, comment);
    toast.success("Avaliação enviada! Obrigada por compartilhar. 💛");
    setAuthor("");
    setRating(5);
    setComment("");
    setFormOpen(false);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="mt-5 border-t border-gold-500/15 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-serif-luxury text-base font-bold text-white flex items-center gap-2">
          <MessageSquare size={15} className="text-gold-400" />
          Avaliações dos Clientes
        </h4>
        <button
          onClick={() => setFormOpen(!formOpen)}
          className="text-[10px] uppercase tracking-wider text-gold-300 hover:text-gold-200 border border-gold-500/30 hover:border-gold-400/60 px-2.5 py-1 rounded-full transition-all"
        >
          {formOpen ? "Cancelar" : "+ Avaliar"}
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {/* Nota média */}
        <div className="bg-obsidian-900/60 rounded-xl p-3 border border-gold-500/15 text-center">
          <p className="text-3xl font-serif-luxury font-bold text-gold-400">
            {avg > 0 ? avg.toFixed(1) : "—"}
          </p>
          <div className="flex items-center justify-center gap-0.5 my-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                size={12}
                className={
                  s <= Math.round(avg)
                    ? "fill-gold-400 text-gold-400"
                    : "text-gray-700"
                }
              />
            ))}
          </div>
          <p className="text-[9px] text-gray-400 uppercase tracking-wider">
            {total} {total === 1 ? "avaliação" : "avaliações"}
          </p>
        </div>

        {/* Distribuição */}
        <div className="sm:col-span-2 bg-obsidian-900/60 rounded-xl p-3 border border-gold-500/15">
          {total === 0 ? (
            <div className="flex items-center justify-center h-full text-[10px] text-gray-500">
              <div className="text-center">
                <Star size={20} className="mx-auto mb-1 text-gold-500/40" />
                <p>Seja a primeira a avaliar este perfume!</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {dist.map((d) => {
                const pct = total > 0 ? (d.count / total) * 100 : 0;
                return (
                  <div
                    key={d.star}
                    className="flex items-center gap-1.5 text-[10px]"
                  >
                    <span className="text-gold-300 w-3">{d.star}</span>
                    <Star size={9} className="fill-gold-400 text-gold-400" />
                    <div className="flex-grow h-1.5 bg-obsidian-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-gold-500 to-gold-300 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-gray-400 w-6 text-right">
                      {d.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Form de nova review */}
      {formOpen && (
        <form
          onSubmit={submit}
          className="bg-gold-500/5 rounded-xl p-3 border border-gold-500/25 mb-4 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Seu nome (ou apelido)"
              maxLength={40}
              className="bg-obsidian-900 border border-gold-500/30 rounded-lg py-1.5 px-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-400"
            />
            <div className="flex items-center gap-1 justify-start sm:justify-end">
              <span className="text-[10px] text-gray-400 mr-1">Sua nota:</span>
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRating(s)}
                  onMouseEnter={() => setHoverRating(s)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="transition-transform hover:scale-110"
                  aria-label={`${s} estrela${s > 1 ? "s" : ""}`}
                >
                  <Star
                    size={16}
                    className={
                      s <= (hoverRating || rating)
                        ? "fill-gold-400 text-gold-400"
                        : "text-gray-700"
                    }
                  />
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Conte sua experiência: fixação, silage, elogios recebidos..."
            rows={2}
            maxLength={280}
            className="w-full bg-obsidian-900 border border-gold-500/30 rounded-lg py-2 px-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-400 resize-none"
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-[9px] text-gray-500">
              {comment.length}/280 caracteres
            </span>
            <button
              type="submit"
              className="btn-gold px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
            >
              <Send size={11} /> Enviar Avaliação
            </button>
          </div>
        </form>
      )}

      {/* Lista de reviews */}
      {productReviews.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          <MessageSquare size={28} className="mx-auto mb-2 text-gold-500/30" />
          <p className="text-xs">Ainda não há avaliações para este perfume.</p>
          <p className="text-[10px] mt-1">
            Seja a primeira a compartilhar sua experiência!
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
          {productReviews.map((r) => (
            <div
              key={r.id}
              className="bg-obsidian-900/40 rounded-xl p-3 border border-gold-500/10 group"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gold-500/30 to-gold-600/10 border border-gold-500/40 flex items-center justify-center text-gold-300 shrink-0">
                    <User size={13} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {r.author}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            size={9}
                            className={
                              s <= r.rating
                                ? "fill-gold-400 text-gold-400"
                                : "text-gray-700"
                            }
                          />
                        ))}
                      </div>
                      <span className="text-[9px] text-gray-500">
                        {formatDate(r.date)}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm("Remover esta avaliação?")) {
                      deleteReview(r.id);
                      toast.info("Avaliação removida.");
                    }
                  }}
                  className="text-red-400/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remover avaliação"
                  title="Remover avaliação"
                >
                  <Trash2 size={11} />
                </button>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                {r.comment}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
