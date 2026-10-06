"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Sistema de Comparação de Perfumes.
 * Permite comparar até 3 perfumes lado a lado.
 * Persistido em localStorage (comparação não se perde ao recarregar).
 *
 * Máximo: 3 perfumes simultaneamente (UX ideal — mais que isso fica confuso).
 */

const MAX_COMPARE = 3;

interface CompareStoreState {
  /** IDs dos produtos selecionados para comparação */
  ids: string[];
  /** Modal de comparação aberto/fechado */
  modalOpen: boolean;
  /** Adiciona produto à comparação (se ainda houver espaço) */
  addToCompare: (id: string) => { success: boolean; message: string };
  /** Remove produto da comparação */
  removeFromCompare: (id: string) => void;
  /** Limpa todos os produtos da comparação */
  clearCompare: () => void;
  /** Abre/fecha o modal de comparação */
  setModalOpen: (v: boolean) => void;
  /** Verifica se um produto está na lista de comparação */
  isInCompare: (id: string) => boolean;
  /** Conta quantos produtos estão na comparação */
  compareCount: () => number;
  /** Verifica ainda há espaço na comparação */
  canAddMore: () => boolean;
}

export const useCompareStore = create<CompareStoreState>()(
  persist(
    (set, get) => ({
      ids: [],
      modalOpen: false,

      addToCompare: (id) => {
        const state = get();
        // Já está na lista → ignora
        if (state.ids.includes(id)) {
          return {
            success: false,
            message: "Este perfume já está na comparação.",
          };
        }
        // Verifica limite
        if (state.ids.length >= MAX_COMPARE) {
          return {
            success: false,
            message: `Máximo de ${MAX_COMPARE} perfumes na comparação. Remova um para adicionar outro.`,
          };
        }
        set({ ids: [...state.ids, id] });
        return {
          success: true,
          message: "Perfume adicionado à comparação!",
        };
      },

      removeFromCompare: (id) =>
        set((state) => ({
          ids: state.ids.filter((i) => i !== id),
          // Se a lista ficar vazia, fecha o modal
          modalOpen:
            state.ids.filter((i) => i !== id).length === 0
              ? false
              : state.modalOpen,
        })),

      clearCompare: () => set({ ids: [], modalOpen: false }),
      setModalOpen: (v) => set({ modalOpen: v }),
      isInCompare: (id) => get().ids.includes(id),
      compareCount: () => get().ids.length,
      canAddMore: () => get().ids.length < MAX_COMPARE,
    }),
    {
      name: "mimi-compare",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ ids: state.ids }),
    }
  )
);

export { MAX_COMPARE };
