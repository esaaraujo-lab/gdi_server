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
  /** D1 SYNC — fetch reviews for a product (or all if no productId) and merge into store */
  syncReviewsFromD1: (productId?: string) => Promise<void>;
}

/** D1 SYNC — helper: fire-and-forget fetch with error swallowing. */
function d1SyncFetch(url: string, options?: RequestInit, label = "D1 sync review") {
  if (typeof window === "undefined") return; // server-side safety
  void fetch(url, options)
    .then((res) => {
      if (!res.ok) console.warn(`[${label}] HTTP ${res.status}`);
      return res.json().catch(() => null);
    })
    .catch((err) => console.warn(`[${label}] failed:`, err));
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
        const localId = `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newReview: Review = {
          id: localId,
          productId,
          author: author.trim() || "Cliente anônimo",
          rating: Math.max(1, Math.min(5, rating)),
          comment: comment.trim(),
          date: new Date().toISOString(),
        };
        set((state) => ({ reviews: [newReview, ...state.reviews] }));

        // D1 SYNC — POST review to D1, then update local id to match D1 id
        if (typeof window !== "undefined") {
          void fetch("/api/db/reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productId: newReview.productId,
              author: newReview.author,
              rating: newReview.rating,
              comment: newReview.comment,
            }),
          })
            .then((res) => res.json())
            .then((data) => {
              // Replace local id with D1-generated id so future DELETE works against D1
              if (data?.success && data.id && data.id !== localId) {
                set((state) => ({
                  reviews: state.reviews.map((r) =>
                    r.id === localId ? { ...r, id: data.id as string } : r
                  ),
                }));
              }
            })
            .catch((err) => console.warn("[D1 sync] addReview failed:", err));
        }
      },

      deleteReview: (id) => {
        set((state) => ({
          reviews: state.reviews.filter((r) => r.id !== id),
        }));
        // D1 SYNC — DELETE review by id (fire-and-forget)
        d1SyncFetch(
          `/api/db/reviews?id=${encodeURIComponent(id)}`,
          { method: "DELETE" },
          "D1 sync deleteReview"
        );
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
        // D1 SYNC — delete ALL reviews from D1 (admin wipe, fire-and-forget).
        // The DELETE handler wipes the entire `reviews` table when no `?id=` is passed.
        d1SyncFetch(
          "/api/db/reviews",
          { method: "DELETE" },
          "D1 sync clearAllReviews"
        );
      },

      // D1 SYNC — fetch reviews for a product (or all) and merge into store
      syncReviewsFromD1: async (productId) => {
        try {
          const url = productId
            ? `/api/db/reviews?productId=${encodeURIComponent(productId)}`
            : "/api/db/reviews";
          const res = await fetch(url);
          const data = await res.json();
          if (!data?.success || !Array.isArray(data.reviews)) return;

          const d1Reviews: Review[] = data.reviews.map((r: any) => ({
            id: r.id,
            productId: r.product_id || r.productId || "",
            author: r.author || "Cliente anônimo",
            rating: typeof r.rating === "number" ? r.rating : 5,
            comment: r.comment || "",
            date: r.date || new Date().toISOString(),
            verified: r.verified === 1 || r.verified === true,
          }));

          if (productId) {
            // Per-product merge: replace only this product's reviews with D1 version
            set((state) => ({
              reviews: [
                ...d1Reviews,
                ...state.reviews.filter((r) => r.productId !== productId),
              ],
            }));
          } else if (d1Reviews.length > 0) {
            // Full sync: replace all
            set({ reviews: d1Reviews });
          }
        } catch (err) {
          console.warn("[D1 sync] reviews sync failed:", err);
        }
      },
    }),
    {
      name: "mimi-reviews",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
