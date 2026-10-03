"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Sistema de avaliações de clientes.
 * Cada perfume pode ter múltiplas reviews (nome + nota + comentário + data).
 * Persistido em localStorage — admin pode ver todas as reviews.
 */

export interface Review {
  id: string;
  productId: string; // ex: "bc-001"
  author: string;
  rating: number; // 1-5
  comment: string;
  date: string; // ISO date
  verified?: boolean; // marca de compra verificada (futuro)
}

interface ReviewStoreState {
  reviews: Review[];
  addReview: (
    productId: string,
    author: string,
    rating: number,
    comment: string
  ) => void;
  deleteReview: (id: string) => void;
  getProductReviews: (productId: string) => Review[];
  getAverageRating: (productId: string) => number;
  getReviewCount: (productId: string) => number;
  clearAll: () => void;
  syncReviewsFromD1: () => Promise<void>;
}

// Algumas reviews iniciais para demonstrar o sistema
const SEED_REVIEWS: Review[] = [
  {
    id: "seed-1",
    productId: "bc-001",
    author: "Ricardo M.",
    rating: 5,
    comment:
      "Fragrância incrível! Fixação de mais de 8h. Recebi elogios o dia todo. Super recomendo.",
    date: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: "seed-2",
    productId: "bc-001",
    author: "Carla S.",
    rating: 4,
    comment:
      "Cheiro maravilhoso, mas achei um pouco menos intenso que o original. Mesmo assim vale a pena pelo preço.",
    date: new Date(Date.now() - 86400000 * 7).toISOString(),
  },
  {
    id: "seed-3",
    productId: "bc-012",
    author: "Juliana P.",
    rating: 5,
    comment:
      "Perfeito! Igualzinho ao La Vie Est Belle. Marido adorou o presente. Já é meu 3º frasco!",
    date: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
  {
    id: "seed-4",
    productId: "bc-312",
    author: "Patrícia L.",
    rating: 5,
    comment:
      "Khamrah é viciante! Canela e tâara em harmonia perfeita. Para a noite então, é sucesso garantido.",
    date: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: "seed-5",
    productId: "bc-002",
    author: "Fernando A.",
    rating: 5,
    comment:
      "London Gentleman é sofisticado e marcante. Uso no trabalho e recebo elogios. Fixação excelente.",
    date: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
  {
    id: "seed-6",
    productId: "bc-086",
    author: "Marina T.",
    rating: 5,
    comment:
      "Baccarat Rouge 540 é o perfume mais luxuoso que já tive. Saffron+âmbar surreal. Vale cada centavo.",
    date: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "seed-7",
    productId: "dec-05",
    author: "Bruno C.",
    rating: 5,
    comment:
      "Decante perfeito para experimentar antes de comprar o frasco grande. Khamrah é maravilhoso!",
    date: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
  {
    id: "seed-8",
    productId: "bc-126",
    author: "Aline R.",
    rating: 5,
    comment:
      "Good Girl Stiletto é poderoso! Tuberosa + cacau = combinação perfeita para noite. Recomendo!",
    date: new Date(Date.now() - 86400000 * 6).toISOString(),
  },
];

export const useReviewStore = create<ReviewStoreState>()(
  persist(
    (set, get) => ({
      reviews: SEED_REVIEWS,

      addReview: (productId, author, rating, comment) => {
        const review: Review = {
          id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          productId,
          author: author.trim() || "Cliente anônimo",
          rating: Math.max(1, Math.min(5, rating)),
          comment: comment.trim(),
          date: new Date().toISOString(),
        };
        set((state) => ({ reviews: [review, ...state.reviews] }));
        // Sync to D1 (fire-and-forget)
        void fetch("/api/db/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(review),
        }).catch(() => {});
      },

      deleteReview: (id) => {
        set((state) => ({
          reviews: state.reviews.filter((r) => r.id !== id),
        }));
        // Sync to D1 (fire-and-forget)
        void fetch(`/api/db/reviews?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
      },

      getProductReviews: (productId) =>
        get()
          .reviews.filter((r) => r.productId === productId)
          .sort(
            (a, b) =>
              new Date(b.date).getTime() - new Date(a.date).getTime()
          ),

      getAverageRating: (productId) => {
        const reviews = get().reviews.filter((r) => r.productId === productId);
        if (reviews.length === 0) return 0;
        const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
        return Math.round((sum / reviews.length) * 10) / 10;
      },

      getReviewCount: (productId) =>
        get().reviews.filter((r) => r.productId === productId).length,

      clearAll: () => {
        set({ reviews: [] });
        // Sync to D1 (fire-and-forget)
        void fetch("/api/db/reviews", { method: "DELETE" }).catch(() => {});
      },

      syncReviewsFromD1: async () => {
        try {
          const res = await fetch("/api/db/reviews", { method: "GET" });
          if (!res.ok) return;
          const data = await res.json();
          if (!data?.success || !Array.isArray(data.reviews)) return;
          if (data.reviews.length > 0) {
            // Map D1 row (snake_case) to Review (camelCase)
            const reviews: Review[] = data.reviews.map((r: Record<string, unknown>) => ({
              id: String(r.id ?? ""),
              productId: String(r.productId ?? r.product_id ?? ""),
              author: String(r.author ?? ""),
              rating: Number(r.rating ?? 5),
              comment: String(r.comment ?? ""),
              date: String(r.date ?? r.created_at ?? new Date().toISOString()),
            }));
            set({ reviews });
          }
        } catch {
          // silent
        }
      },
    }),
    {
      name: "mimi-reviews",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

/** Convenience standalone function for sync (used in page.tsx effects). */
export function syncReviewsFromD1(): Promise<void> {
  return useReviewStore.getState().syncReviewsFromD1();
}
