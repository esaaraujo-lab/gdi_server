"use client";

import { useState } from "react";
import { useUI } from "@/lib/stores-combined";
import { Lock, X, Store, Sliders, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminAuthModal() {
  const open = useUI((s) => s.adminAuthOpen);
  const setOpen = useUI((s) => s.setAdminAuthOpen);
  const setAdminPanelOpen = useUI((s) => s.setAdminPanelOpen);
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pass }),
      });
      const data = (await res.json()) as { success: boolean };
      if (data.success) {
        setOpen(false);
        setAdminPanelOpen(true);
        setPass("");
        toast.success("Bem-vindo ao painel administrativo.");
      } else {
        toast.error("Senha incorreta!");
      }
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel max-w-sm w-full rounded-2xl p-6 relative border border-gold-500/40">
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>
        <div className="text-center mb-4">
          <div className="w-12 h-12 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center mx-auto mb-2 text-gold-400">
            <Lock size={22} />
          </div>
          <h3 className="font-serif-luxury text-2xl font-bold text-white flex items-center justify-center gap-2">
            <Sliders size={18} className="text-gold-400" />
            Acesso do Administrador
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Digite a senha para gerenciar preços e estoque.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Senha do administrador"
            required
            autoFocus
            disabled={loading}
            className="w-full bg-obsidian-900 border border-gold-500/30 rounded-xl py-2.5 px-3 text-xs text-white focus:outline-none focus:border-gold-400 text-center disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-gold py-2.5 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <Store size={14} />
                Entrar no Painel
              </>
            )}
          </button>
        </form>
        <p className="text-[9px] text-gray-600 mt-3 text-center">
          🔒 Autenticação via API segura (hash não visível no código-fonte)
        </p>
      </div>
    </div>
  );
}
