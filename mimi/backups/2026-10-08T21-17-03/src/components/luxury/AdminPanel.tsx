"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { useStore, useUI } from "@/lib/stores-combined";
import { formatBRL } from "@/lib/pix";
import type { Perfume, ProductGender } from "@/lib/perfumes";
import {
  DEFAULT_PRICE_BRAND,
  DEFAULT_PRICE_AFEER,
  DEFAULT_PRICE_DECANTE,
} from "@/lib/perfumes";
import { useReviewStore } from "@/lib/review-store";
import { useCouponStore, type CouponType } from "@/lib/coupon-store";
import { useKitStore } from "@/lib/kit-store";
import { usePromotionStore } from "@/lib/promotion-store";
import { useBrandStore, type Brand } from "@/lib/brand-store";
import { toast } from "sonner";
import {
  Store,
  Trash2,
  Plus,
  Save,
  Phone,
  Eraser,
  Crown,
  Edit3,
  X,
  Layers,
  CreditCard,
  Users,
  Star,
  MessageSquare,
  Ticket,
  Power,
  Pin,
  ShoppingCart,
  Truck,
  CheckCircle2,
  PackageCheck,
  Send,
  Tag,
  Gift,
  Upload,
  Loader2,
  Check,
  Sparkles,
  Megaphone,
} from "lucide-react";

type Tab =
  | "products"
  | "add"
  | "categories"
  | "coupons"
  | "reviews"
  | "pinned"
  | "kits"
  | "promotions"
  | "brands"
  | "marquee"
  | "pix"
  | "leads"
  | "subscriptions"
  | "vendas";

export default function AdminPanel() {
  const open = useUI((s) => s.adminPanelOpen);
  const setOpen = useUI((s) => s.setAdminPanelOpen);
  const products = useStore((s) => s.products);
  const leads = useStore((s) => s.leads);
  const categories = useStore((s) => s.categories);
  const pixConfig = useStore((s) => s.pixConfig);
  const globalDefaultPrice = useStore((s) => s.globalDefaultPrice);

  const updateProductPrice = useStore((s) => s.updateProductPrice);
  const updateProduct = useStore((s) => s.updateProduct);
  const toggleStock = useStore((s) => s.toggleStock);
  const deleteProduct = useStore((s) => s.deleteProduct);
  const addProduct = useStore((s) => s.addProduct);
  const applyGlobalPrice = useStore((s) => s.applyGlobalPrice);
  const setStockQty = useStore((s) => s.setStockQty);
  const clearLeads = useStore((s) => s.clearLeads);
  const savePixConfig = useStore((s) => s.savePixConfig);
  const addCategory = useStore((s) => s.addCategory);
  const deleteCategory = useStore((s) => s.deleteCategory);
  const addSubcategory = useStore((s) => s.addSubcategory);

  const [tab, setTab] = useState<Tab>("products");
  const [globalPrice, setGlobalPrice] = useState(globalDefaultPrice.toFixed(2));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Perfume>>({});
  const [newCatName, setNewCatName] = useState("");
  const [newSubcat, setNewSubcat] = useState<{ catId: string; name: string }>({ catId: "", name: "" });

  // Reviews + coupons stores
  const allReviews = useReviewStore((s) => s.reviews);
  const deleteReview = useReviewStore((s) => s.deleteReview);
  const clearAllReviews = useReviewStore((s) => s.clearAll);

  const coupons = useCouponStore((s) => s.coupons);
  const addCoupon = useCouponStore((s) => s.addCoupon);
  const toggleCoupon = useCouponStore((s) => s.toggleCoupon);
  const deleteCoupon = useCouponStore((s) => s.deleteCoupon);

  // Coupon form state
  const [couponForm, setCouponForm] = useState({
    code: "",
    type: "percent" as CouponType,
    value: 10,
    description: "",
    minSubtotal: 0,
    expiresAt: "",
  });

  // Add product form
  const [form, setForm] = useState({
    code: "",
    name: "",
    inspiration: "",
    category: "BRAND",
    gender: "UNISSEX" as ProductGender,
    price: DEFAULT_PRICE_BRAND,
    image: "",
    tags: "",
    notesTopo: "",
    notesCoracao: "",
    notesFundo: "",
    description: "",
    family: "",
    intensity: "Eau de Parfum",
    fixation: "até 8h",
    rating: 5,
    reviewCount: 0,
    season: "",
    occasion: "",
    stockQty: 10,
  });

  const [pixForm, setPixForm] = useState(pixConfig);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Upload de imagem via /api/upload-image (armazena no D1 ou memória)
  const handleImageUpload = async (file: File) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload-image", { method: "POST", body: formData });
      const data = await res.json();
      if (data?.success && data.url) {
        setForm((f) => ({ ...f, image: data.url }));
        toast.success("Imagem enviada! URL salva automaticamente.");
      } else {
        toast.error(data?.error || "Erro no upload da imagem.");
      }
    } catch (err) {
      toast.error("Falha no upload: " + String(err));
    } finally {
      setUploadingImage(false);
    }
  };

  // === Debounced save for price/stock inputs ===
  // MUST be before `if (!open) return null` — hooks can't be conditional
  const [saveStatus, setSaveStatus] = useState<Record<string, "saving" | "saved" | "error">>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const debouncedSave = useCallback(
    (productId: string, field: "price" | "stock", value: number, product: Perfume) => {
      const key = `${productId}:${field}`;
      if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
      setSaveStatus((prev) => ({ ...prev, [key]: "saving" }));

      debounceTimers.current[key] = setTimeout(async () => {
        try {
          const updated: Perfume = field === "price"
            ? { ...product, price: value }
            : { ...product, stockQty: value, inStock: value > 0 };

          const res = await fetch("/api/db/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated),
          });
          const data = await res.json();

          if (data?.success) {
            if (field === "price") {
              updateProductPrice(productId, value);
            } else {
              setStockQty(productId, value);
            }
            setSaveStatus((prev) => ({ ...prev, [key]: "saved" }));
            setTimeout(() => {
              setSaveStatus((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
              });
            }, 2000);
          } else {
            throw new Error(data?.error || "Save failed");
          }
        } catch {
          setSaveStatus((prev) => ({ ...prev, [key]: "error" }));
          toast.error(`Erro ao salvar ${field === "price" ? "preço" : "estoque"}. Tente novamente.`);
          setTimeout(() => {
            setSaveStatus((prev) => {
              const next = { ...prev };
              delete next[key];
              return next;
            });
          }, 3000);
        }
      }, 500);
    },
    [updateProductPrice, setStockQty]
  );

  if (!open) return null;

  // Helper: render save indicator (spinner or ✓)
  const SaveIndicator = ({ productId, field }: { productId: string; field: "price" | "stock" }) => {
    const key = `${productId}:${field}`;
    const status = saveStatus[key];
    if (!status) return null;
    if (status === "saving") return <Loader2 size={11} className="animate-spin text-gold-400 ml-1 shrink-0" />;
    if (status === "saved") return <Check size={11} className="text-emerald-400 ml-1 shrink-0" />;
    if (status === "error") return <span className="text-[9px] text-red-400 ml-1 shrink-0">!</span>;
    return null;
  };

  const tabs: { id: Tab; label: string; icon: typeof Store }[] = [
    { id: "products", label: "Produtos", icon: Store },
    { id: "add", label: "Adicionar", icon: Plus },
    { id: "categories", label: "Categorias", icon: Layers },
    { id: "coupons", label: `Cupons (${coupons.filter((c) => c.active).length})`, icon: Ticket },
    { id: "reviews", label: `Avaliações (${allReviews.length})`, icon: Star },
    { id: "pinned", label: "Destaque", icon: Pin },
    { id: "kits", label: "Kits Promo", icon: Gift },
    { id: "promotions", label: "Promoções", icon: Sparkles },
    { id: "brands", label: "Marcas", icon: Tag },
    { id: "marquee", label: "Marquee", icon: Megaphone },
    { id: "pix", label: "Pix", icon: CreditCard },
    { id: "vendas", label: "Vendas", icon: ShoppingCart },
    { id: "leads", label: `Leads (${leads.length})`, icon: Phone },
    { id: "subscriptions", label: "Assinaturas", icon: Crown },
  ];

  const startEdit = (p: Perfume) => {
    setEditingId(p.id);
    setEditForm({ ...p });
  };

  // Helper: POST product to D1 with toast feedback + retry
  async function saveProductToD1(product: Perfume, isEdit: boolean): Promise<boolean> {
    const loadingToast = toast.loading("Salvando no banco de dados...");
    try {
      const res = await fetch("/api/db/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });
      const data = await res.json();
      if (data?.success) {
        toast.dismiss(loadingToast);
        toast.success(isEdit ? "Produto atualizado com sucesso!" : "Produto criado com sucesso!");
        // Auto-extract and link brand from inspiration (incremental, fire-and-forget)
        if (product.inspiration && product.inspiration.trim()) {
          void fetch("/api/db/brands/autoseed", { method: "POST" }).catch(() => {});
        }
        return true;
      } else {
        throw new Error(data?.error || "Erro ao salvar");
      }
    } catch (err) {
      toast.dismiss(loadingToast);
      // Retry once after 1s
      toast.error("Erro ao salvar. Tentando novamente...");
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const retryRes = await fetch("/api/db/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(product),
        });
        const retryData = await retryRes.json();
        if (retryData?.success) {
          toast.success("Produto salvo após nova tentativa!");
          // Auto-extract and link brand on retry too
          if (product.inspiration && product.inspiration.trim()) {
            void fetch("/api/db/brands/autoseed", { method: "POST" }).catch(() => {});
          }
          return true;
        }
        throw new Error("Retry failed");
      } catch {
        toast.error("Falha ao salvar no banco. Verifique sua conexão e tente novamente.");
        return false;
      }
    }
  }

  const saveEdit = async () => {
    if (!editingId) return;
    const updates: Partial<Perfume> = { ...editForm };
    // Auto-prepend GitHub URL if image is just filename
    if (updates.image && !updates.image.startsWith("http") && !updates.image.startsWith("/")) {
      updates.image = `https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/upload_images/${updates.image}`;
    }
    // Build full product from edit form + existing product
    const existing = products.find((p) => p.id === editingId);
    if (!existing) {
      toast.error("Produto não encontrado. Pode ter sido removido.");
      return;
    }
    const fullProduct: Perfume = { ...existing, ...updates };
    // Save to D1 first (await confirmation), then update store
    const success = await saveProductToD1(fullProduct, true);
    if (success) {
      updateProduct(editingId, updates);
      setEditingId(null);
      setEditForm({});
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code || !form.name || !form.image) {
      toast.error("Preencha código, nome e imagem.");
      return;
    }
    const priceDefault =
      form.category === "AFEER"
        ? DEFAULT_PRICE_AFEER
        : form.category === "DECANTE"
        ? DEFAULT_PRICE_DECANTE
        : DEFAULT_PRICE_BRAND;
    const newObj: Perfume = {
      id: "bc-" + Date.now(),
      code: form.code,
      name: form.name,
      inspiration: form.inspiration || form.name,
      category: form.category as Perfume["category"],
      gender: form.gender,
      price: Number(form.price) || priceDefault,
      inStock: true,
      image: form.image.startsWith("http") || form.image.startsWith("/")
        ? form.image
        : `https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/upload_images/${form.image}`,
      tags: form.tags
        ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      notesTopo: form.notesTopo || "Notas refrescantes",
      notesCoracao: form.notesCoracao || "Acorde floral e especiarias",
      notesFundo: form.notesFundo || "Madeiras nobres e Âmbar",
      description: form.description || "Fragrância exclusiva da curadoria.",
      family: form.family || "Floral Amadeirado",
      intensity: form.intensity,
      fixation: form.fixation,
      rating: Number(form.rating) || 5,
      reviewCount: Number(form.reviewCount) || 0,
      season: form.season || "Dia-Noite / O ano todo",
      occasion: form.occasion || "Casual, Uso diário",
      stockQty: Number(form.stockQty) || 10,
    };
    // Save to D1 first (await confirmation), then add to store
    const success = await saveProductToD1(newObj, false);
    if (success) {
      addProduct(newObj);
    }
    setForm({
      ...form,
      code: "",
      name: "",
      inspiration: "",
      image: "",
      tags: "",
      notesTopo: "",
      notesCoracao: "",
      notesFundo: "",
      description: "",
      family: "",
      season: "",
      occasion: "",
      stockQty: 10,
    });
    setTab("products");
    toast.success("Novo perfume cadastrado!");
  };

  const handleGlobalPrice = () => {
    const p = parseFloat(globalPrice);
    if (!p || p <= 0) {
      toast.error("Preço inválido.");
      return;
    }
    applyGlobalPrice(p);
    toast.success(`Preço global de ${formatBRL(p)} aplicado!`);
  };

  const handleSavePix = (e: React.FormEvent) => {
    e.preventDefault();
    savePixConfig(pixForm);
    toast.success("Configurações Pix salvas!");
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    addCategory(newCatName.trim());
    setNewCatName("");
    toast.success("Categoria criada!");
  };

  const handleAddSubcat = () => {
    if (!newSubcat.catId || !newSubcat.name.trim()) return;
    addSubcategory(newSubcat.catId, newSubcat.name.trim());
    setNewSubcat({ catId: "", name: "" });
    toast.success("Subcategoria adicionada!");
  };

  const inputCls = "w-full bg-obsidian-900 border border-gold-500/30 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-gold-400";
  const labelCls = "block text-[10px] text-gold-300 mb-1 uppercase tracking-wider";

  return (
    <div className="fixed inset-0 z-[70] bg-obsidian-950 overflow-y-auto">
      <div className="max-w-6xl mx-auto p-4 sm:p-8 safe-top">
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gold-500/20 pb-4 mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-gold-400">
              <Store size={20} />
            </div>
            <div>
              <h2 className="font-serif-luxury text-2xl font-bold text-white">Painel Admin — Mimi Mimos</h2>
              <p className="text-xs text-gray-400">Gerenciamento completo do catálogo</p>
            </div>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              // Navigate to / (not /admin) so the admin auth doesn't auto-reopen
              if (typeof window !== "undefined" && window.location.pathname === "/admin") {
                window.location.href = "/";
              }
            }}
            className="btn-gold px-5 py-2 rounded-xl text-xs uppercase flex items-center gap-2"
          >
            <Store size={14} /> Voltar à Loja
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gold-500/10 mb-6 overflow-x-auto pb-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                tab === t.id
                  ? "bg-gold-500 text-obsidian-950"
                  : "bg-obsidian-900 text-gray-300 border border-gold-500/20 hover:border-gold-500/50"
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB: PRODUCTS (edit existing) */}
        {tab === "products" && (
          <div className="space-y-6">
            {/* Global price */}
            <div className="glass-panel p-4 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                <h4 className="text-sm font-bold text-white">Preço Padrão Global</h4>
                <p className="text-xs text-gray-400">Altera o valor de todos os perfumes.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gold-400 font-bold">R$</span>
                <input type="number" step="0.01" value={globalPrice} onChange={(e) => setGlobalPrice(e.target.value)} className="w-28 bg-obsidian-900 border border-gold-500/30 rounded-xl py-1.5 px-3 text-xs text-white" />
                <button onClick={handleGlobalPrice} className="btn-gold px-4 py-1.5 rounded-xl text-xs flex items-center gap-1.5">
                  <Save size={12} /> Aplicar a Todos
                </button>
              </div>
            </div>

            {/* Products list — responsive: cards on mobile, table on desktop */}
            <div className="glass-panel rounded-xl overflow-hidden">
              {/* Desktop table (hidden on mobile) */}
              <table className="hidden md:table w-full text-left text-xs text-gray-300">
                <thead className="bg-obsidian-900 text-gold-300 uppercase tracking-wider text-[10px] border-b border-gold-500/20">
                  <tr>
                    <th className="p-3">Produto</th>
                    <th className="p-3">Categoria</th>
                    <th className="p-3">Preço</th>
                    <th className="p-3">Estoque</th>
                    <th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gold-500/10">
                  {products.map((p) => (
                    <Fragment key={p.id}>
                      <tr className="hover:bg-obsidian-900/40">
                        <td className="p-3 font-bold text-white">
                          <div className="flex items-center gap-2">
                            <img src={p.image} alt={p.name} className="w-8 h-8 rounded object-cover" loading="lazy" />
                            <span>{p.name} ({p.code})</span>
                          </div>
                        </td>
                        <td className="p-3 uppercase text-[10px]">{p.category}</td>
                        <td className="p-3">
                          <div className="flex items-center">
                            <input
                              type="number"
                              step="0.01"
                              value={p.price}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v)) debouncedSave(p.id, "price", v, p);
                              }}
                              className="w-20 bg-obsidian-900 border border-gold-500/30 rounded py-1 px-2 text-xs text-gold-400 font-bold"
                            />
                            <SaveIndicator productId={p.id} field="price" />
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center">
                              <input
                                type="number"
                                min="0"
                                value={p.stockQty ?? 0}
                                onChange={(e) => {
                                  const q = parseInt(e.target.value || "0", 10);
                                  const val = isNaN(q) ? 0 : Math.max(0, q);
                                  debouncedSave(p.id, "stock", val, p);
                                }}
                                className="w-16 bg-obsidian-900 border border-gold-500/30 rounded py-1 px-2 text-xs text-gold-400 font-bold text-center"
                              />
                              <SaveIndicator productId={p.id} field="stock" />
                            </div>
                            <button
                              onClick={() => { toggleStock(p.id); toast.success("Estoque atualizado."); }}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${
                                p.inStock
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                  : "bg-red-500/20 text-red-400 border-red-500/30"
                              }`}
                            >
                              {p.inStock ? "Em Estoque" : "Esgotado"}
                            </button>
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <button onClick={() => startEdit(p)} className="text-gold-400 hover:underline text-xs mr-2">
                            <Edit3 size={14} className="inline" /> Editar
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("Excluir este perfume?")) {
                                deleteProduct(p.id);
                                toast.success("Perfume removido.");
                              }
                            }}
                            className="text-red-400 hover:underline text-xs"
                          >
                            <Trash2 size={14} className="inline" />
                          </button>
                        </td>
                      </tr>
                      {/* Edit row */}
                      {editingId === p.id && (
                        <tr className="bg-obsidian-900/60">
                          <td colSpan={5} className="p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              <div>
                                <label className={labelCls}>Nome</label>
                                <input className={inputCls} value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                              </div>
                              <div>
                                <label className={labelCls}>Código</label>
                                <input className={inputCls} value={editForm.code || ""} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} />
                              </div>
                              <div>
                                <label className={labelCls}>Inspiração</label>
                                <input className={inputCls} value={editForm.inspiration || ""} onChange={(e) => setEditForm({ ...editForm, inspiration: e.target.value })} />
                              </div>
                              <div>
                                <label className={labelCls}>Imagem (nome do arquivo ou URL)</label>
                                <input className={inputCls} value={editForm.image || ""} onChange={(e) => setEditForm({ ...editForm, image: e.target.value })} placeholder="bc-001.jpg ou https://..." />
                              </div>
                              <div>
                                <label className={labelCls}>Tags (vírgula)</label>
                                <input className={inputCls} value={(editForm.tags || []).join(", ")} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value.split(",").map(t => t.trim()) })} />
                              </div>
                              <div>
                                <label className={labelCls}>Família Olfativa</label>
                                <input className={inputCls} value={editForm.family || ""} onChange={(e) => setEditForm({ ...editForm, family: e.target.value })} />
                              </div>
                              <div>
                                <label className={labelCls}>Notas de Topo</label>
                                <input className={inputCls} value={editForm.notesTopo || ""} onChange={(e) => setEditForm({ ...editForm, notesTopo: e.target.value })} />
                              </div>
                              <div>
                                <label className={labelCls}>Notas de Coração</label>
                                <input className={inputCls} value={editForm.notesCoracao || ""} onChange={(e) => setEditForm({ ...editForm, notesCoracao: e.target.value })} />
                              </div>
                              <div>
                                <label className={labelCls}>Notas de Fundo</label>
                                <input className={inputCls} value={editForm.notesFundo || ""} onChange={(e) => setEditForm({ ...editForm, notesFundo: e.target.value })} />
                              </div>
                              <div className="sm:col-span-2 lg:col-span-3">
                                <label className={labelCls}>Descrição</label>
                                <textarea className={inputCls + " h-16"} value={editForm.description || ""} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                              </div>
                            </div>
                            <div className="flex gap-2 mt-3">
                              <button onClick={saveEdit} className="btn-gold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5">
                                <Save size={12} /> Salvar Alterações
                              </button>
                              <button onClick={() => { setEditingId(null); setEditForm({}); }} className="px-4 py-2 rounded-xl text-xs border border-gray-500/30 text-gray-400">
                                Cancelar
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>

              {/* Mobile cards (hidden on desktop) */}
              <div className="md:hidden divide-y divide-gold-500/10">
                {products.map((p) => (
                  <div key={p.id} className="p-3 space-y-3">
                    {/* Product info row */}
                    <div className="flex items-center gap-2">
                      <img src={p.image} alt={p.name} className="w-10 h-10 rounded object-cover shrink-0" loading="lazy" />
                      <div className="flex-grow min-w-0">
                        <p className="text-xs font-bold text-white truncate">{p.name}</p>
                        <p className="text-[10px] text-gray-400">{p.code} · {p.category}</p>
                      </div>
                    </div>
                    {/* Price + Stock row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gold-400 font-bold">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={p.price}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v)) debouncedSave(p.id, "price", v, p);
                          }}
                          className="w-20 bg-obsidian-900 border border-gold-500/30 rounded py-1 px-2 text-xs text-gold-400 font-bold"
                        />
                        <SaveIndicator productId={p.id} field="price" />
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          value={p.stockQty ?? 0}
                          onChange={(e) => {
                            const q = parseInt(e.target.value || "0", 10);
                            const val = isNaN(q) ? 0 : Math.max(0, q);
                            debouncedSave(p.id, "stock", val, p);
                          }}
                          className="w-14 bg-obsidian-900 border border-gold-500/30 rounded py-1 px-2 text-xs text-gold-400 font-bold text-center"
                        />
                        <SaveIndicator productId={p.id} field="stock" />
                        <button
                          onClick={() => { toggleStock(p.id); toast.success("Estoque atualizado."); }}
                          className={`px-2 py-1 rounded-full text-[9px] font-bold border whitespace-nowrap ${
                            p.inStock
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                              : "bg-red-500/20 text-red-400 border-red-500/30"
                          }`}
                        >
                          {p.inStock ? "Em Estoque" : "Esgotado"}
                        </button>
                      </div>
                    </div>
                    {/* Actions row */}
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(p)} className="flex-1 text-gold-400 hover:bg-gold-500/10 text-xs py-2 rounded-lg border border-gold-500/30 flex items-center justify-center gap-1">
                        <Edit3 size={14} /> Editar
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Excluir este perfume?")) {
                            deleteProduct(p.id);
                            toast.success("Perfume removido.");
                          }
                        }}
                        className="px-3 text-red-400 hover:bg-red-500/10 text-xs py-2 rounded-lg border border-red-500/30 flex items-center justify-center gap-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {/* Edit form (mobile) */}
                    {editingId === p.id && (
                      <div className="bg-obsidian-900/60 rounded-xl p-3 space-y-2">
                        <div>
                          <label className={labelCls}>Nome</label>
                          <input className={inputCls} value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                        </div>
                        <div>
                          <label className={labelCls}>Código</label>
                          <input className={inputCls} value={editForm.code || ""} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} />
                        </div>
                        <div>
                          <label className={labelCls}>Inspiração</label>
                          <input className={inputCls} value={editForm.inspiration || ""} onChange={(e) => setEditForm({ ...editForm, inspiration: e.target.value })} />
                        </div>
                        <div>
                          <label className={labelCls}>Imagem (nome do arquivo ou URL)</label>
                          <input className={inputCls} value={editForm.image || ""} onChange={(e) => setEditForm({ ...editForm, image: e.target.value })} placeholder="bc-001.jpg ou https://..." />
                        </div>
                        <div>
                          <label className={labelCls}>Tags (vírgula)</label>
                          <input className={inputCls} value={(editForm.tags || []).join(", ")} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value.split(",").map(t => t.trim()) })} />
                        </div>
                        <div>
                          <label className={labelCls}>Família Olfativa</label>
                          <input className={inputCls} value={editForm.family || ""} onChange={(e) => setEditForm({ ...editForm, family: e.target.value })} />
                        </div>
                        <div>
                          <label className={labelCls}>Notas de Topo</label>
                          <input className={inputCls} value={editForm.notesTopo || ""} onChange={(e) => setEditForm({ ...editForm, notesTopo: e.target.value })} />
                        </div>
                        <div>
                          <label className={labelCls}>Notas de Coração</label>
                          <input className={inputCls} value={editForm.notesCoracao || ""} onChange={(e) => setEditForm({ ...editForm, notesCoracao: e.target.value })} />
                        </div>
                        <div>
                          <label className={labelCls}>Notas de Fundo</label>
                          <input className={inputCls} value={editForm.notesFundo || ""} onChange={(e) => setEditForm({ ...editForm, notesFundo: e.target.value })} />
                        </div>
                        <div>
                          <label className={labelCls}>Descrição</label>
                          <textarea className={inputCls + " h-16"} value={editForm.description || ""} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveEdit} className="flex-1 btn-gold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5">
                            <Save size={12} /> Salvar
                          </button>
                          <button onClick={() => { setEditingId(null); setEditForm({}); }} className="px-4 py-2 rounded-xl text-xs border border-gray-500/30 text-gray-400">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: ADD */}
        {tab === "add" && (
          <div className="glass-panel p-6 rounded-2xl max-w-2xl mx-auto">
            <h3 className="font-serif-luxury text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Plus className="text-gold-400" size={20} /> Adicionar Novo Perfume
            </h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={labelCls}>Código</label><input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="#999" required className={inputCls} /></div>
                <div><label className={labelCls}>Nome</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Brand Collection #999" required className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={labelCls}>Inspiração</label><input type="text" value={form.inspiration} onChange={(e) => setForm({ ...form, inspiration: e.target.value })} placeholder="Good Girl (CH)" className={inputCls} /></div>
                <div><label className={labelCls}>Coleção</label>
                  <select value={form.category} onChange={(e) => { const cat = e.target.value; const dp = cat === "AFEER" ? DEFAULT_PRICE_AFEER : cat === "DECANTE" ? DEFAULT_PRICE_DECANTE : DEFAULT_PRICE_BRAND; setForm({ ...form, category: cat, price: dp }); }} className={inputCls}>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className={labelCls}>Gênero</label>
                  <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as ProductGender })} className={inputCls}>
                    <option value="FEMININO">Feminino</option>
                    <option value="MASCULINO">Masculino</option>
                    <option value="ARABE">Árabe</option>
                    <option value="UNISSEX">Unissex</option>
                  </select>
                </div>
                <div><label className={labelCls}>Preço (R$)</label><input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) })} required className={inputCls} /></div>
                <div><label className={labelCls}>Avaliação</label><input type="number" step="0.1" min="0" max="5" value={form.rating} onChange={(e) => setForm({ ...form, rating: parseFloat(e.target.value) })} className={inputCls} /></div>
              </div>
              <div>
                <label className={labelCls}>Imagem (upload, nome do arquivo ou URL)</label>
                <div className="flex gap-2">
                  <input type="text" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="bc-999.jpg ou https://..." required className={inputCls + " flex-1"} />
                  <label
                    className={`shrink-0 px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer border transition-all ${
                      uploadingImage
                        ? "bg-gray-600/30 border-gray-600/40 text-gray-400"
                        : "bg-gold-500/15 hover:bg-gold-500/30 border-gold-500/40 text-gold-300"
                    }`}
                  >
                    <Upload size={13} />
                    {uploadingImage ? "Enviando..." : "Upload"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      disabled={uploadingImage}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImageUpload(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {form.image && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={form.image} alt="preview" className="w-12 h-12 rounded object-cover border border-gold-500/30" />
                    <button type="button" onClick={() => setForm({ ...form, image: "" })} className="text-[10px] text-red-400 hover:underline">Remover</button>
                  </div>
                )}
              </div>
              <div><label className={labelCls}>Tags (vírgula)</label><input type="text" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Baunilha, Oud, Floral" className={inputCls} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className={labelCls}>Notas de Topo</label><input type="text" value={form.notesTopo} onChange={(e) => setForm({ ...form, notesTopo: e.target.value })} className={inputCls} /></div>
                <div><label className={labelCls}>Notas de Coração</label><input type="text" value={form.notesCoracao} onChange={(e) => setForm({ ...form, notesCoracao: e.target.value })} className={inputCls} /></div>
                <div><label className={labelCls}>Notas de Fundo</label><input type="text" value={form.notesFundo} onChange={(e) => setForm({ ...form, notesFundo: e.target.value })} className={inputCls} /></div>
              </div>
              <div><label className={labelCls}>Descrição</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={inputCls} /></div>
              <button type="submit" className="w-full btn-gold py-3 rounded-xl text-xs uppercase font-bold flex items-center justify-center gap-2">
                <Plus size={14} /> Cadastrar Perfume
              </button>
            </form>
          </div>
        )}

        {/* TAB: CATEGORIES */}
        {tab === "categories" && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl max-w-xl mx-auto">
              <h3 className="font-serif-luxury text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Layers className="text-gold-400" size={18} /> Criar Nova Categoria
              </h3>
              <div className="flex gap-2">
                <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Ex: Perfumes Importados 50ml" className={inputCls} />
                <button onClick={handleAddCategory} className="btn-gold px-4 py-2 rounded-xl text-xs whitespace-nowrap flex items-center gap-1.5">
                  <Plus size={12} /> Criar
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {categories.map((cat) => (
                <div key={cat.id} className="glass-panel p-4 rounded-xl">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-white">{cat.name}</h4>
                      <p className="text-[10px] text-gray-400">ID: {cat.id}</p>
                    </div>
                    <button
                      onClick={() => { if (confirm("Excluir categoria?")) { deleteCategory(cat.id); toast.success("Categoria removida."); } }}
                      className="text-red-400 hover:underline text-xs"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {/* Subcategorias */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    {cat.subcategories.map((sub) => (
                      <span key={sub} className="text-[10px] bg-gold-500/10 text-gold-300 border border-gold-500/20 rounded-full px-2 py-0.5">
                        {sub}
                      </span>
                    ))}
                  </div>
                  {/* Add subcategory */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nova subcategoria..."
                      value={newSubcat.catId === cat.id ? newSubcat.name : ""}
                      onChange={(e) => setNewSubcat({ catId: cat.id, name: e.target.value })}
                      className={inputCls + " flex-grow"}
                    />
                    <button
                      onClick={() => { if (newSubcat.catId === cat.id) handleAddSubcat(); }}
                      className="btn-gold px-3 py-1.5 rounded-lg text-[10px] whitespace-nowrap"
                    >
                      + Sub
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: PIX */}
        {tab === "pix" && (
          <div className="glass-panel p-6 rounded-2xl max-w-xl mx-auto space-y-4">
            <h3 className="font-serif-luxury text-2xl font-bold text-white mb-2 flex items-center gap-2">
              <CreditCard className="text-gold-400" size={20} /> Configurar Pix
            </h3>
            <form onSubmit={handleSavePix} className="space-y-4">
              <div><label className={labelCls}>Chave Pix</label><input type="text" value={pixForm.key} onChange={(e) => setPixForm({ ...pixForm, key: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls}>Nome do Beneficiário</label><input type="text" value={pixForm.name} onChange={(e) => setPixForm({ ...pixForm, name: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls}>Cidade</label><input type="text" value={pixForm.city} onChange={(e) => setPixForm({ ...pixForm, city: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls}>Grupo WhatsApp (Avise-me)</label><input type="text" value={pixForm.whatsappGroup} onChange={(e) => setPixForm({ ...pixForm, whatsappGroup: e.target.value })} className={inputCls} /></div>
              <button type="submit" className="w-full btn-gold py-3 rounded-xl text-xs uppercase font-bold flex items-center justify-center gap-2">
                <Save size={14} /> Salvar Configurações
              </button>
            </form>
          </div>
        )}

        {/* TAB: LEADS */}
        {tab === "leads" && (
          <div className="glass-panel p-6 rounded-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-serif-luxury text-xl font-bold text-white">Leads WhatsApp</h3>
              <button onClick={() => { if (confirm("Limpar histórico?")) { clearLeads(); toast.success("Leads limpos."); } }} className="text-xs text-red-400 hover:underline flex items-center gap-1">
                <Eraser size={12} /> Limpar
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300 min-w-[600px]">
                <thead className="bg-obsidian-900 text-gold-300 uppercase text-[10px]">
                  <tr><th className="p-3">Data</th><th className="p-3">Nome</th><th className="p-3">WhatsApp</th><th className="p-3">Perfume</th></tr>
                </thead>
                <tbody className="divide-y divide-gold-500/10">
                  {leads.length === 0 ? (
                    <tr><td colSpan={4} className="p-4 text-center text-gray-500">Nenhum lead capturado.</td></tr>
                  ) : (
                    leads.map((l, i) => (
                      <tr key={i}><td className="p-3 text-gray-400">{l.date}</td><td className="p-3 font-bold text-white">{l.name}</td><td className="p-3 text-emerald-400">{l.phone}</td><td className="p-3 text-gold-300">{l.product}</td></tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: COUPONS */}
        {tab === "coupons" && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl max-w-2xl mx-auto">
              <h3 className="font-serif-luxury text-xl font-bold text-white mb-1 flex items-center gap-2">
                <Ticket className="text-gold-400" size={18} /> Criar Novo Cupom
              </h3>
              <p className="text-[11px] text-gray-400 mb-4">
                Gere códigos promocionais para campanhas, descontos sazonais ou parcerias.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Código (maiúsculo)</label>
                  <input
                    type="text"
                    value={couponForm.code}
                    onChange={(e) =>
                      setCouponForm({
                        ...couponForm,
                        code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                      })
                    }
                    placeholder="EX: NATAL15"
                    className={inputCls + " uppercase tracking-wider"}
                  />
                </div>
                <div>
                  <label className={labelCls}>Tipo de Desconto</label>
                  <select
                    value={couponForm.type}
                    onChange={(e) =>
                      setCouponForm({
                        ...couponForm,
                        type: e.target.value as CouponType,
                      })
                    }
                    className={inputCls}
                  >
                    <option value="percent">Percentual (%)</option>
                    <option value="fixed">Valor fixo (R$)</option>
                    <option value="freeship">Frete grátis</option>
                    <option value="decante3x100">Combo 3 decantes</option>
                  </select>
                </div>
                {(couponForm.type === "percent" ||
                  couponForm.type === "fixed" ||
                  couponForm.type === "decante3x100") && (
                  <div>
                    <label className={labelCls}>
                      {couponForm.type === "percent"
                        ? "Percentual (%)"
                        : couponForm.type === "decante3x100"
                        ? "Preço do combo (R$)"
                        : "Valor do desconto (R$)"}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={couponForm.value}
                      onChange={(e) =>
                        setCouponForm({
                          ...couponForm,
                          value: parseFloat(e.target.value) || 0,
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Pedido Mínimo (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={couponForm.minSubtotal}
                    onChange={(e) =>
                      setCouponForm({
                        ...couponForm,
                        minSubtotal: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="0 = sem mínimo"
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Descrição (visível ao cliente)</label>
                  <input
                    type="text"
                    value={couponForm.description}
                    onChange={(e) =>
                      setCouponForm({ ...couponForm, description: e.target.value })
                    }
                    placeholder="Ex: 15% OFF acima de R$ 150"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Expira em (opcional)</label>
                  <input
                    type="date"
                    value={couponForm.expiresAt}
                    onChange={(e) =>
                      setCouponForm({ ...couponForm, expiresAt: e.target.value })
                    }
                    className={inputCls}
                  />
                </div>
              </div>
              <button
                onClick={() => {
                  if (!couponForm.code || couponForm.code.length < 4) {
                    toast.error("Código deve ter ao menos 4 caracteres.");
                    return;
                  }
                  if (coupons.some((c) => c.code === couponForm.code)) {
                    toast.error("Já existe um cupom com este código.");
                    return;
                  }
                  if (
                    (couponForm.type === "percent" ||
                      couponForm.type === "fixed" ||
                      couponForm.type === "decante3x100") &&
                    (!couponForm.value || couponForm.value <= 0)
                  ) {
                    toast.error("Informe um valor válido para o desconto.");
                    return;
                  }
                  if (!couponForm.description.trim()) {
                    toast.error("Adicione uma descrição para o cliente.");
                    return;
                  }
                  addCoupon({
                    code: couponForm.code,
                    type: couponForm.type,
                    value: couponForm.value,
                    description: couponForm.description.trim(),
                    minSubtotal: couponForm.minSubtotal || undefined,
                    expiresAt: couponForm.expiresAt
                      ? new Date(couponForm.expiresAt).toISOString()
                      : undefined,
                  });
                  toast.success(`Cupom ${couponForm.code} criado!`);
                  setCouponForm({
                    code: "",
                    type: "percent",
                    value: 10,
                    description: "",
                    minSubtotal: 0,
                    expiresAt: "",
                  });
                }}
                className="w-full btn-gold py-3 rounded-xl text-xs uppercase font-bold flex items-center justify-center gap-2"
              >
                <Plus size={14} /> Criar Cupom
              </button>
            </div>

            {/* Lista de cupons existentes */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-serif-luxury text-lg font-bold text-white flex items-center gap-2">
                  <Ticket className="text-gold-400" size={16} />
                  Cupons Cadastrados ({coupons.length})
                </h4>
                <p className="text-[10px] text-gray-500">
                  Ativos: {coupons.filter((c) => c.active).length} •{" "}
                  Inativos: {coupons.filter((c) => !c.active).length}
                </p>
              </div>
              {coupons.length === 0 ? (
                <div className="text-center py-12 glass-panel rounded-2xl">
                  <Ticket className="mx-auto mb-2 text-gold-500/30" size={36} />
                  <p className="text-xs text-gray-500">Nenhum cupom cadastrado.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {coupons.map((c) => {
                    const isExpired =
                      c.expiresAt && new Date(c.expiresAt).getTime() < Date.now();
                    return (
                      <div
                        key={c.code}
                        className={`glass-panel p-4 rounded-xl border transition-all ${
                          !c.active
                            ? "border-gray-500/20 opacity-60"
                            : isExpired
                            ? "border-red-500/30"
                            : "border-gold-500/30 hover:border-gold-400/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gold-300 uppercase tracking-wider">
                                {c.code}
                              </span>
                              {isExpired && (
                                <span className="text-[9px] bg-red-500/20 text-red-300 border border-red-500/30 rounded-full px-1.5 py-0.5 uppercase tracking-wider">
                                  Expirado
                                </span>
                              )}
                              {!c.active && !isExpired && (
                                <span className="text-[9px] bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-full px-1.5 py-0.5 uppercase tracking-wider">
                                  Inativo
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {c.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => {
                                toggleCoupon(c.code);
                                toast.info(
                                  `Cupom ${c.code} ${
                                    c.active ? "desativado" : "ativado"
                                  }.`
                                );
                              }}
                              className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
                                c.active
                                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                                  : "bg-gray-500/10 border-gray-500/30 text-gray-400 hover:bg-gray-500/20"
                              }`}
                              title={c.active ? "Desativar" : "Ativar"}
                              aria-label={c.active ? "Desativar cupom" : "Ativar cupom"}
                            >
                              <Power size={12} />
                            </button>
                            <button
                              onClick={() => {
                                if (
                                  confirm(`Excluir cupom ${c.code}? Esta ação não pode ser desfeita.`)
                                ) {
                                  deleteCoupon(c.code);
                                  toast.success(`Cupom ${c.code} excluído.`);
                                }
                              }}
                              className="w-7 h-7 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/15 transition-all flex items-center justify-center"
                              title="Excluir"
                              aria-label="Excluir cupom"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-gray-400">
                          <span className="flex items-center gap-1">
                            <strong className="text-gold-300">Tipo:</strong>{" "}
                            {c.type === "percent"
                              ? `${c.value}% OFF`
                              : c.type === "fixed"
                              ? `R$ ${c.value.toFixed(2)} OFF`
                              : c.type === "freeship"
                              ? "Frete grátis"
                              : `3 decantes por R$ ${c.value.toFixed(2)}`}
                          </span>
                          {c.minSubtotal ? (
                            <span className="text-gray-500">
                              Mín: R$ {c.minSubtotal.toFixed(2)}
                            </span>
                          ) : null}
                          {c.expiresAt && (
                            <span className="text-gray-500">
                              Val.: {" "}
                              {new Date(c.expiresAt).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: REVIEWS */}
        {tab === "reviews" && (
          <div className="glass-panel p-6 rounded-2xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-serif-luxury text-xl font-bold text-white flex items-center gap-2">
                  <Star className="text-gold-400" size={18} /> Avaliações de Clientes
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  {allReviews.length} avaliações em todos os produtos. Clique em "Ver produto" para abrir o QuickView.
                </p>
              </div>
              {allReviews.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm(`Apagar todas as ${allReviews.length} avaliações? Esta ação não pode ser desfeita.`)) {
                      clearAllReviews();
                      toast.success("Todas as avaliações foram removidas.");
                    }
                  }}
                  className="text-xs text-red-400 hover:underline flex items-center gap-1"
                >
                  <Eraser size={12} /> Limpar Tudo
                </button>
              )}
            </div>
            {allReviews.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <MessageSquare className="mx-auto mb-2 text-gold-500/30" size={36} />
                <p className="text-xs">Ainda não há avaliações de clientes.</p>
                <p className="text-[10px] mt-1">As avaliações aparecerão aqui automaticamente quando enviadas.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {allReviews
                  .slice()
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((r) => {
                    const product = products.find((p) => p.id === r.productId);
                    return (
                      <div
                        key={r.id}
                        className="bg-obsidian-900/40 rounded-xl p-3 border border-gold-500/10 flex items-start gap-3 group hover:border-gold-500/30 transition-all"
                      >
                        <div className="flex items-center gap-1 shrink-0 mt-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              size={11}
                              className={
                                s <= r.rating
                                  ? "text-gold-400 fill-gold-400"
                                  : "text-gray-700"
                              }
                            />
                          ))}
                        </div>
                        <div className="flex-grow min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-white">{r.author}</p>
                            <span className="text-[9px] text-gray-500">
                              {new Date(r.date).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-300 mt-0.5 leading-relaxed">
                            {r.comment}
                          </p>
                          {product && (
                            <button
                              onClick={() => {
                                setOpen(false);
                                setTimeout(() => {
                                  // Use SlideIn drawer for better UX
                                  window.dispatchEvent(
                                    new CustomEvent("openSlideIn", { detail: product })
                                  );
                                }, 200);
                              }}
                              className="text-[9px] text-gold-400 hover:underline mt-1.5 inline-flex items-center gap-1"
                            >
                              <MessageSquare size={9} /> Ver perfume: {product.name}
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            if (confirm("Remover esta avaliação?")) {
                              deleteReview(r.id);
                              toast.success("Avaliação removida.");
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity shrink-0"
                          aria-label="Remover avaliação"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* TAB: PINNED (Produto em Destaque) */}
        {tab === "pinned" && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl max-w-2xl mx-auto">
              <h3 className="font-serif-luxury text-xl font-bold text-white mb-1 flex items-center gap-2">
                <Pin className="text-gold-400" size={18} fill="currentColor" /> Produto em Destaque
              </h3>
              <p className="text-[11px] text-gray-400 mb-4">
                Escolha um produto para fixar no banner principal (aparece logo
                após o Hero, em todas as páginas). Use para promoções,
                novidades ou itens imperdíveis.
              </p>

              {/* Preview do banner atual */}
              <PinnedPreview />

              {/* Form para alterar */}
              <div className="space-y-3 mt-5 border-t border-gold-500/15 pt-4">
                <label className={labelCls}>Selecionar Produto</label>
                <PinnedForm products={products} />
              </div>
            </div>
          </div>
        )}

        {/* TAB: KITS PROMOCIONAIS */}
        {tab === "kits" && <KitsTab products={products} />}

        {/* TAB: PROMOTIONS (manageable special offers from D1) */}
        {tab === "promotions" && <PromotionsTab />}

        {/* TAB: BRANDS (manageable brands linked to products) */}
        {tab === "brands" && <BrandsTab products={products} />}

        {/* TAB: MARQUEE (editable marquee bar text from D1) */}
        {tab === "marquee" && <MarqueeTab />}

        {/* TAB: VENDAS (Pedidos + Clientes D1) */}
        {tab === "vendas" && <VendasTab />}

        {/* TAB: SUBSCRIPTIONS */}
        {tab === "subscriptions" && (
          <div className="glass-panel p-6 rounded-2xl">
            <h3 className="font-serif-luxury text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Crown className="text-gold-400" size={18} /> Assinaturas do Clube VIP
            </h3>
            <p className="text-xs text-gray-400 mb-4">Assinaturas criadas via Pix Recorrente (OpenFinance). Em produção, conectar com Cloudflare D1 para persistir dados.</p>
            <div className="space-y-2">
              <div className="bg-obsidian-900/60 rounded-xl p-3 border border-gold-500/10 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center text-gold-400">
                  <Users size={18} />
                </div>
                <div className="flex-grow">
                  <p className="text-xs font-bold text-white">Assinaturas Ativas</p>
                  <p className="text-[10px] text-gray-400">Via Pix Recorrente automático</p>
                </div>
                <span className="text-2xl font-serif-luxury font-bold text-gold-400">0</span>
              </div>
              <div className="bg-obsidian-900/60 rounded-xl p-3 border border-gold-500/10">
                <p className="text-[11px] text-gray-400">
                  💡 Para ativar a persistência de assinaturas, crie um banco Cloudflare D1 e
                  atualize o token com permissão D1. As assinaturas serão salvas automaticamente.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PINNED PRODUCT — sub-componentes inline (preview + form para alterar)
// D1-only persistence (no localStorage) — reads/writes via /api/db/pinned
// ============================================================================

const PINNED_BADGES = ["Imperdível", "Promoção", "Novidade", "Últimas Unidades"] as const;

function savePinnedConfig(config: { productId: string; badge: string } | null) {
  if (config === null) {
    // Delete pinned from D1
    void fetch("/api/db/pinned", { method: "DELETE" }).catch(() => {});
  } else {
    // Save pinned to D1
    void fetch("/api/db/pinned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }).catch(() => {});
  }
  // Notify same-tab listeners (PinnedProductBanner)
  window.dispatchEvent(new Event("pinned-updated"));
}

function PinnedPreview() {
  // Load from D1 on mount (no localStorage)
  const [config, setConfig] = useState<{
    productId: string;
    badge: string;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Fetch pinned config from D1
    fetch("/api/db/pinned", { method: "GET" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data.pinned && data.pinned.productId) {
          setConfig({ productId: data.pinned.productId, badge: data.pinned.badge || "Imperdível" });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    // Listen for pinned-updated events (from PinnedForm save)
    const onPinnedUpdate = () => {
      fetch("/api/db/pinned", { method: "GET" })
        .then((res) => res.json())
        .then((data) => {
          if (data?.success && data.pinned && data.pinned.productId) {
            setConfig({ productId: data.pinned.productId, badge: data.pinned.badge || "Imperdível" });
          } else {
            setConfig(null);
          }
        })
        .catch(() => {});
    };
    window.addEventListener("pinned-updated", onPinnedUpdate);
    return () => window.removeEventListener("pinned-updated", onPinnedUpdate);
  }, []);

  if (!loaded) {
    return (
      <div className="bg-obsidian-900/60 rounded-xl p-4 border border-gold-500/15 text-center">
        <Loader2 size={20} className="mx-auto mb-2 text-gold-400 animate-spin" />
        <p className="text-xs text-gray-400">Carregando destaque...</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="bg-obsidian-900/60 rounded-xl p-4 border border-gold-500/15 text-center">
        <Pin size={28} className="mx-auto mb-2 text-gold-500/40" />
        <p className="text-xs text-gray-400">
          Nenhum produto em destaque configurado.
        </p>
        <p className="text-[10px] text-gray-500 mt-1">
          Selecione abaixo para exibir no banner principal.
        </p>
      </div>
    );
  }

  // Trigger refresh — admin pode clicar para recarregar
  return (
    <div className="bg-gold-500/5 border border-gold-500/25 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
        <p className="text-[11px] text-emerald-300 font-bold uppercase tracking-wider">
          Banner Ativo
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <p className="text-gray-500">Produto ID:</p>
          <p className="text-gold-300 font-bold truncate">{config.productId}</p>
        </div>
        <div>
          <p className="text-gray-500">Badge:</p>
          <p className="text-gold-300 font-bold">{config.badge}</p>
        </div>
      </div>
      <p className="text-[10px] text-gray-500 mt-3 italic">
        💡 As alterações serão visíveis ao recarregar a página principal.
      </p>
    </div>
  );
}

function PinnedForm({ products }: { products: Perfume[] }) {
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [badge, setBadge] = useState<string>("Imperdível");

  // Load initial values from D1
  useEffect(() => {
    fetch("/api/db/pinned", { method: "GET" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data.pinned && data.pinned.productId) {
          setProductId(data.pinned.productId);
          setBadge(data.pinned.badge || "Imperdível");
        }
      })
      .catch(() => {});
  }, []);

  const selected = products.find((p) => p.id === productId);

  const save = () => {
    if (!productId) {
      toast.error("Selecione um produto.");
      return;
    }
    savePinnedConfig({ productId, badge });
    // Notifica componentes que o destaque foi atualizado
    window.dispatchEvent(new Event("pinned-updated"));
    toast.success("Produto em destaque salvo! Recarregue a página principal para ver.");
  };

  const clear = () => {
    savePinnedConfig(null);
    window.dispatchEvent(new Event("pinned-updated"));
    toast.info("Destaque removido. Banner não aparecerá.");
  };

  return (
    <div className="space-y-3">
      <select
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        className="w-full bg-obsidian-900 border border-gold-500/30 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-gold-400"
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} — {p.name} ({p.category})
          </option>
        ))}
      </select>

      {/* Badge selection */}
      <div>
        <label className="block text-[10px] text-gold-300 mb-1.5 uppercase tracking-wider">
          Tipo de Badge
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {PINNED_BADGES.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBadge(b)}
              className={`px-2 py-1.5 rounded-lg text-[10px] uppercase tracking-wider font-bold border transition-all ${
                badge === b
                  ? "bg-gold-500 text-obsidian-950 border-gold-400"
                  : "bg-obsidian-900 text-gold-300 border-gold-500/30 hover:border-gold-500/60"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Preview of selected */}
      {selected && (
        <div className="bg-obsidian-900/60 rounded-xl p-3 border border-gold-500/15 flex items-center gap-3">
          <img
            src={selected.image}
            alt={selected.name}
            className="w-12 h-12 object-cover rounded-lg bg-obsidian-950 border border-gold-500/15"
          />
          <div className="flex-grow min-w-0">
            <p className="text-xs font-bold text-white truncate">
              {selected.name}
            </p>
            <p className="text-[10px] text-gold-300 truncate">
              {selected.code} • {selected.category}
            </p>
          </div>
          <span className="text-[10px] text-gold-400 font-bold">
            {selected.price.toFixed(2).replace(".", ",")}
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={save}
          className="flex-1 btn-gold py-2.5 rounded-xl text-xs uppercase font-bold flex items-center justify-center gap-1.5"
        >
          <Save size={12} /> Salvar Destaque
        </button>
        <button
          onClick={clear}
          className="px-4 py-2.5 rounded-xl text-xs uppercase font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all flex items-center gap-1.5"
        >
          <Trash2 size={12} /> Remover
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// VENDAS TAB — Pedidos + Clientes (Cloudflare D1)
// ============================================================================

interface D1Order {
  id: string;
  txid: string | null;
  customer_name: string;
  customer_whatsapp: string;
  customer_email: string | null;
  shipping_name: string | null;
  shipping_price: number;
  shipping_address: string | null;
  shipping_cep: string | null;
  coupon_code: string | null;
  coupon_discount: number;
  gift_wrap: number;
  gift_wrap_price: number;
  gift_message: string | null;
  items_json: string | null;
  subtotal: number;
  total: number;
  status: string;
  payment_method: string;
  created_at: string;
  confirmed_at: string | null;
}

interface D1Customer {
  id: string;
  name: string;
  whatsapp: string;
  email: string | null;
  device_name: string | null;
  device_type: string | null;
  total_orders: number;
  total_spent: number;
  first_visit: string;
  last_visit: string;
  created_at: string;
}

type VendasView = "pedidos" | "clientes";
type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Aguardando",
  confirmed: "Confirmado",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40",
  confirmed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  shipped: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  delivered: "bg-gray-500/15 text-gray-300 border-gray-500/40",
  cancelled: "bg-red-500/15 text-red-300 border-red-500/40",
};

const vendasInputCls =
  "w-full bg-obsidian-900 border border-gold-500/30 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-gold-400";

function VendasTab() {
  const [view, setView] = useState<VendasView>("pedidos");
  const [orders, setOrders] = useState<D1Order[]>([]);
  const [customers, setCustomers] = useState<D1Customer[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [source, setSource] = useState<string>("");

  const fetchOrders = async () => {
    setLoadingOrders(true);
    try {
      const url = statusFilter === "all"
        ? "/api/db/orders"
        : `/api/db/orders?status=${statusFilter}`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        setOrders(data.orders ?? []);
        setSource(data.source ?? "");
      } else {
        toast.error("Erro ao buscar pedidos.");
      }
    } catch {
      toast.error("Falha de rede ao buscar pedidos.");
    } finally {
      setLoadingOrders(false);
    }
  };

  const fetchCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const r = await fetch("/api/db/customers");
      if (r.ok) {
        const data = await r.json();
        setCustomers(data.customers ?? []);
      } else {
        toast.error("Erro ao buscar clientes.");
      }
    } catch {
      toast.error("Falha de rede ao buscar clientes.");
    } finally {
      setLoadingCustomers(false);
    }
  };

  useEffect(() => {
    if (view === "pedidos") fetchOrders();
    else fetchCustomers();
  }, [view, statusFilter]);

  const updateOrderStatus = async (id: string, status: OrderStatus) => {
    try {
      const r = await fetch(`/api/db/orders?id=${id}&status=${status}`, {
        method: "PATCH",
      });
      if (r.ok) {
        toast.success(`Pedido ${STATUS_LABELS[status].toLowerCase()}.`);
        // Se confirmado, abre WhatsApp do cliente para combinar entrega.
        if (status === "confirmed") {
          const order = orders.find((o) => o.id === id);
          if (order) {
            const phone = order.customer_whatsapp.replace(/\D/g, "");
            const msg = `✅ *PEDIDO CONFIRMADO — MIMI MIMOS!*\n\nOlá ${order.customer_name}! Recebemos seu pagamento e seu pedido está confirmado. 🎉\n\n📦 Pedido: ${order.txid || order.id}\n💰 Total: ${formatBRL(order.total)}\n\nEm breve entraremos em contato para combinar a entrega.`;
            window.open(
              `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,
              "_blank"
            );
          }
        }
        fetchOrders();
      } else {
        toast.error("Falha ao atualizar status.");
      }
    } catch {
      toast.error("Erro de rede ao atualizar status.");
    }
  };

  const deleteCustomer = async (id: string, name: string) => {
    if (!confirm(`Remover cliente ${name}? Esta ação não pode ser desfeita.`)) return;
    try {
      const r = await fetch(`/api/db/customers?id=${id}`, { method: "DELETE" });
      if (r.ok) {
        toast.success("Cliente removido.");
        fetchCustomers();
      } else {
        toast.error("Falha ao remover cliente.");
      }
    } catch {
      toast.error("Erro de rede ao remover cliente.");
    }
  };

  const sendPromoAll = () => {
    if (customers.length === 0) {
      toast.info("Nenhum cliente cadastrado para receber a promoção.");
      return;
    }
    const msg = `💎 *MIMI MIMOS — OFERTA EXCLUSIVA!*\n\nOlá! Você é nosso cliente VIP e ganhou uma condição especial. 🎁\n\nConfira nossas novidades e use o cupom VIP10 para 10% OFF na próxima compra.\n\n_loja.mimimimos.com.br_`;
    const numbers = customers.map((c) => c.whatsapp.replace(/\D/g, ""));
    if (numbers.length === 0) {
      toast.info("Nenhum WhatsApp válido encontrado.");
      return;
    }
    const first = numbers[0];
    window.open(
      `https://wa.me/${first}?text=${encodeURIComponent(msg)}`,
      "_blank"
    );
    // WhatsApp Web não suporta broadcast direto por URL — copia o restante
    // dos números para a área de transferência para envio sequencial manual.
    if (numbers.length > 1) {
      navigator.clipboard.writeText(numbers.join("\n")).then(() => {
        toast.success(
          `Promoção aberta para o primeiro cliente. ${numbers.length - 1} números restantes copiados para a área de transferência.`
        );
      }).catch(() => {
        toast.success("Promoção aberta. Envie manualmente para os demais.");
      });
    } else {
      toast.success("Promoção aberta no WhatsApp.");
    }
  };

  // Stats summary
  const totalRevenue = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((acc, o) => acc + (o.total || 0), 0);
  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const customersCount = customers.length;
  const customersRevenue = customers.reduce(
    (acc, c) => acc + (c.total_spent || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header + view toggle */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="font-serif-luxury text-xl font-bold text-white flex items-center gap-2">
            <ShoppingCart className="text-gold-400" size={18} />
            Vendas — Pedidos & Clientes
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Persistido no Cloudflare D1
            {source && (
              <span className="ml-2 text-[10px] text-gold-400/70 uppercase">
                · source: {source}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView("pedidos")}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
              view === "pedidos"
                ? "bg-gold-500 text-obsidian-950"
                : "bg-obsidian-900 text-gray-300 border border-gold-500/20 hover:border-gold-500/50"
            }`}
          >
            <ShoppingCart size={14} /> Pedidos
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 ml-1">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setView("clientes")}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
              view === "clientes"
                ? "bg-gold-500 text-obsidian-950"
                : "bg-obsidian-900 text-gray-300 border border-gold-500/20 hover:border-gold-500/50"
            }`}
          >
            <Users size={14} /> Clientes ({customersCount})
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Receita Pedidos" value={formatBRL(totalRevenue)} icon={<Tag size={16} />} accent="gold" />
        <StatCard label="Pendentes" value={String(pendingCount)} icon={<ShoppingCart size={16} />} accent="yellow" />
        <StatCard label="Clientes" value={String(customersCount)} icon={<Users size={16} />} accent="emerald" />
        <StatCard label="Receita Clientes" value={formatBRL(customersRevenue)} icon={<CreditCard size={16} />} accent="blue" />
      </div>

      {/* ORDERS VIEW */}
      {view === "pedidos" && (
        <div className="space-y-4">
          <div className="glass-panel p-3 rounded-xl flex flex-wrap items-center gap-3">
            <label className="text-[10px] text-gold-300 uppercase tracking-wider">
              Filtrar:
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={vendasInputCls + " max-w-[200px]"}
            >
              <option value="all">Todos</option>
              <option value="pending">Aguardando</option>
              <option value="confirmed">Confirmados</option>
              <option value="shipped">Enviados</option>
              <option value="delivered">Entregues</option>
              <option value="cancelled">Cancelados</option>
            </select>
            <button
              onClick={fetchOrders}
              className="btn-gold px-3 py-1.5 rounded-lg text-[10px] uppercase flex items-center gap-1"
            >
              <Save size={11} /> Atualizar
            </button>
          </div>

          {loadingOrders ? (
            <div className="glass-panel p-8 rounded-2xl text-center text-xs text-gray-400">
              Carregando pedidos...
            </div>
          ) : orders.length === 0 ? (
            <div className="glass-panel p-12 rounded-2xl text-center">
              <ShoppingCart className="mx-auto mb-3 text-gold-500/30" size={36} />
              <p className="text-xs text-gray-500">Nenhum pedido encontrado.</p>
              <p className="text-[10px] text-gray-500 mt-1">
                Os pedidos confirmados pelo Pix aparecerão aqui automaticamente.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onStatusChange={updateOrderStatus}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* CUSTOMERS VIEW */}
      {view === "clientes" && (
        <div className="space-y-4">
          <div className="glass-panel p-3 rounded-xl flex justify-between items-center gap-3">
            <p className="text-[11px] text-gray-400">
              {customersCount} cliente(s) cadastrado(s) via WhatsApp.
            </p>
            <div className="flex gap-2">
              <button
                onClick={fetchCustomers}
                className="btn-gold px-3 py-1.5 rounded-lg text-[10px] uppercase flex items-center gap-1"
              >
                <Save size={11} /> Atualizar
              </button>
              <button
                onClick={sendPromoAll}
                disabled={customers.length === 0}
                className="px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white flex items-center gap-1"
              >
                <Send size={11} /> Enviar Promoção
              </button>
            </div>
          </div>

          {loadingCustomers ? (
            <div className="glass-panel p-8 rounded-2xl text-center text-xs text-gray-400">
              Carregando clientes...
            </div>
          ) : customers.length === 0 ? (
            <div className="glass-panel p-12 rounded-2xl text-center">
              <Users className="mx-auto mb-3 text-gold-500/30" size={36} />
              <p className="text-xs text-gray-500">Nenhum cliente cadastrado ainda.</p>
              <p className="text-[10px] text-gray-500 mt-1">
                Os clientes aparecerão aqui quando confirmarem o primeiro pedido.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {customers.map((c) => (
                <CustomerCard
                  key={c.id}
                  customer={c}
                  onDelete={deleteCustomer}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: "gold" | "yellow" | "emerald" | "blue";
}) {
  const accentClass = {
    gold: "border-gold-500/30 text-gold-400",
    yellow: "border-yellow-500/30 text-yellow-400",
    emerald: "border-emerald-500/30 text-emerald-400",
    blue: "border-blue-500/30 text-blue-400",
  }[accent];
  return (
    <div className={`glass-panel p-3 rounded-xl border ${accentClass}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[9px] text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-serif-luxury font-bold text-white truncate">{value}</p>
    </div>
  );
}

function OrderCard({
  order,
  onStatusChange,
}: {
  order: D1Order;
  onStatusChange: (id: string, status: OrderStatus) => void;
}) {
  const items = (() => {
    try {
      return JSON.parse(order.items_json || "[]") as Array<{
        name: string;
        code?: string;
        qty: number;
        price: number;
      }>;
    } catch {
      return [];
    }
  })();

  const status = (order.status as OrderStatus) || "pending";
  const date = new Date(order.created_at).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const waLink = `https://wa.me/${order.customer_whatsapp.replace(/\D/g, "")}`;

  return (
    <div className="glass-panel p-4 rounded-xl border border-gold-500/15 hover:border-gold-500/40 transition-all">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-bold text-gold-300 font-mono">
              #{order.txid || order.id.slice(-8).toUpperCase()}
            </span>
            <span
              className={`text-[9px] uppercase tracking-wider font-bold rounded-full px-2 py-0.5 border ${STATUS_COLORS[status]}`}
            >
              {STATUS_LABELS[status]}
            </span>
          </div>
          <p className="text-[10px] text-gray-500">{date}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-serif-luxury font-bold text-gold-400">
            {formatBRL(order.total)}
          </p>
          <p className="text-[9px] text-gray-500 uppercase">
            {order.payment_method}
          </p>
        </div>
      </div>

      <div className="bg-obsidian-900/60 rounded-xl p-3 mb-3 space-y-1 text-xs">
        <div className="flex items-center gap-2 text-white">
          <Users size={12} className="text-gold-400" />
          <span className="font-bold">{order.customer_name}</span>
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="text-emerald-400 hover:underline text-[11px] ml-auto flex items-center gap-1"
          >
            <Phone size={11} /> {order.customer_whatsapp}
          </a>
        </div>
        {order.customer_email && (
          <p className="text-[10px] text-gray-400">{order.customer_email}</p>
        )}
        {order.shipping_name && (
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <Truck size={11} className="text-gold-400" /> {order.shipping_name}
            {order.shipping_price === 0
              ? " (Grátis)"
              : ` (${formatBRL(order.shipping_price)})`}
          </p>
        )}
      </div>

      {items.length > 0 && (
        <div className="mb-3 space-y-1">
          <p className="text-[10px] text-gold-300 uppercase tracking-wider mb-1">
            Itens ({items.length})
          </p>
          {items.map((it, i) => (
            <div
              key={i}
              className="flex justify-between text-[11px] text-gray-300"
            >
              <span className="truncate pr-2">
                {it.qty}x {it.name}
                {it.code && (
                  <span className="text-gray-500 ml-1">({it.code})</span>
                )}
              </span>
              <span className="shrink-0 text-gold-300">
                {formatBRL(it.price * it.qty)}
              </span>
            </div>
          ))}
        </div>
      )}

      {(order.coupon_code || order.gift_wrap) && (
        <div className="flex flex-wrap gap-2 mb-3 text-[10px]">
          {order.coupon_code && (
            <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded-full px-2 py-0.5 flex items-center gap-1">
              <Tag size={9} /> {order.coupon_code}
              {order.coupon_discount > 0 &&
                ` (-${formatBRL(order.coupon_discount)})`}
            </span>
          )}
          {order.gift_wrap === 1 && (
            <span className="bg-purple-500/10 text-purple-300 border border-purple-500/30 rounded-full px-2 py-0.5 flex items-center gap-1">
              <Gift size={9} /> Embrulho +
              {formatBRL(order.gift_wrap_price || 0)}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-gold-500/10">
        {status === "pending" && (
          <button
            onClick={() => onStatusChange(order.id, "confirmed")}
            className="px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1"
          >
            <CheckCircle2 size={12} /> Confirmar
          </button>
        )}
        {status === "confirmed" && (
          <button
            onClick={() => onStatusChange(order.id, "shipped")}
            className="px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1"
          >
            <Truck size={12} /> Marcar Enviado
          </button>
        )}
        {status === "shipped" && (
          <button
            onClick={() => onStatusChange(order.id, "delivered")}
            className="px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold bg-gray-700 hover:bg-gray-600 text-white flex items-center gap-1"
          >
            <PackageCheck size={12} /> Marcar Entregue
          </button>
        )}
        {status !== "delivered" && status !== "cancelled" && (
          <button
            onClick={() => onStatusChange(order.id, "cancelled")}
            className="px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 flex items-center gap-1"
          >
            <X size={12} /> Cancelar
          </button>
        )}
        <a
          href={waLink}
          target="_blank"
          rel="noreferrer"
          className="ml-auto px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 flex items-center gap-1"
        >
          <MessageSquare size={12} /> WhatsApp
        </a>
      </div>
    </div>
  );
}

function CustomerCard({
  customer,
  onDelete,
}: {
  customer: D1Customer;
  onDelete: (id: string, name: string) => void;
}) {
  const waLink = `https://wa.me/${customer.whatsapp.replace(/\D/g, "")}`;
  const lastVisit = new Date(customer.last_visit).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="glass-panel p-4 rounded-xl border border-gold-500/15 hover:border-gold-500/40 transition-all">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">{customer.name}</p>
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1 mt-0.5"
          >
            <Phone size={10} /> {customer.whatsapp}
          </a>
          {customer.email && (
            <p className="text-[10px] text-gray-400 truncate mt-0.5">
              {customer.email}
            </p>
          )}
        </div>
        <button
          onClick={() => onDelete(customer.id, customer.name)}
          className="opacity-50 hover:opacity-100 text-red-400 transition-opacity"
          aria-label="Remover cliente"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-obsidian-900/60 rounded-lg p-2">
          <p className="text-[9px] text-gray-500 uppercase tracking-wider">
            Pedidos
          </p>
          <p className="text-sm font-bold text-gold-300">
            {customer.total_orders}
          </p>
        </div>
        <div className="bg-obsidian-900/60 rounded-lg p-2">
          <p className="text-[9px] text-gray-500 uppercase tracking-wider">
            Total Gasto
          </p>
          <p className="text-sm font-bold text-emerald-300">
            {formatBRL(customer.total_spent)}
          </p>
        </div>
      </div>

      {(customer.device_name || customer.device_type) && (
        <div className="text-[10px] text-gray-500 mb-3">
          <p className="flex items-center gap-1">
            <CreditCard size={10} />
            {customer.device_name || "Dispositivo desconhecido"}
            {customer.device_type && (
              <span className="text-gray-600 ml-1">({customer.device_type})</span>
            )}
          </p>
        </div>
      )}

      <p className="text-[9px] text-gray-500 mb-2">Última visita: {lastVisit}</p>

      <div className="flex gap-2">
        <a
          href={waLink}
          target="_blank"
          rel="noreferrer"
          className="flex-1 px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1"
        >
          <MessageSquare size={11} /> WhatsApp
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// KITS PROMOCIONAIS — CRUD completo via useKitStore (localStorage + D1 sync)
// ============================================================================

function KitsTab({ products }: { products: Perfume[] }) {
  const kits = useKitStore((s) => s.kits);
  const addKit = useKitStore((s) => s.addKit);
  const deleteKit = useKitStore((s) => s.deleteKit);
  const toggleKit = useKitStore((s) => s.toggleKit);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    productIds: [] as string[],
    price: 0,
    badge: "",
    active: true,
  });

  const inputCls =
    "w-full bg-obsidian-900 border border-gold-500/30 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-gold-400";
  const labelCls = "block text-[10px] text-gold-300 mb-1 uppercase tracking-wider";

  const toggleProductInKit = (id: string) => {
    setForm((f) => ({
      ...f,
      productIds: f.productIds.includes(id)
        ? f.productIds.filter((x) => x !== id)
        : [...f.productIds, id],
    }));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Informe o nome do kit.");
      return;
    }
    if (form.productIds.length < 2) {
      toast.error("Selecione ao menos 2 produtos para o kit.");
      return;
    }
    addKit({
      name: form.name.trim(),
      description: form.description.trim(),
      productIds: form.productIds,
      price: Number(form.price) || 0,
      image: "",
      badge: form.badge.trim(),
      active: form.active,
    });
    toast.success("Kit criado e sincronizado!");
    setForm({ name: "", description: "", productIds: [], price: 0, badge: "", active: true });
    setShowForm(false);
  };

  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="font-serif-luxury text-xl font-bold text-white flex items-center gap-2">
            <Gift className="text-gold-400" size={18} /> Kits Promocionais
          </h3>
          <p className="text-[11px] text-gray-400 mt-1">
            Crie combos com desconto (2-3 perfumes por preço fechado). Aparece
            na seção &quot;Combos com Desconto&quot; da loja.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-gold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 whitespace-nowrap"
        >
          <Plus size={14} /> {showForm ? "Cancelar" : "Novo Kit"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleAdd}
          className="glass-panel p-6 rounded-2xl space-y-4 max-w-2xl mx-auto"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Nome do Kit *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Kit Casal Luxo"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Preço do Kit (R$) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) =>
                  setForm({ ...form, price: parseFloat(e.target.value) || 0 })
                }
                className={inputCls}
                required
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Descrição</label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={2}
              placeholder="Ex: 1 feminino + 1 masculino com embrulho grátis."
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Badge (opcional)</label>
            <input
              type="text"
              value={form.badge}
              onChange={(e) => setForm({ ...form, badge: e.target.value })}
              placeholder="Ex: Economize R$ 30"
              className={inputCls}
            />
          </div>
          {/* Product picker */}
          <div>
            <label className={labelCls}>
              Produtos do Kit ({form.productIds.length} selecionados — mínimo 2)
            </label>
            <div className="max-h-64 overflow-y-auto bg-obsidian-900/60 rounded-xl border border-gold-500/15 p-2 space-y-1">
              {products.map((p) => {
                const checked = form.productIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition ${
                      checked ? "bg-gold-500/15" : "hover:bg-obsidian-800/60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProductInKit(p.id)}
                      className="accent-gold-500"
                    />
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-7 h-7 rounded object-cover"
                      loading="lazy"
                    />
                    <span className="text-xs text-gray-200 flex-grow truncate">
                      {p.name}{" "}
                      <span className="text-gray-500">({p.code})</span>
                    </span>
                    <span className="text-[10px] text-gold-400 font-bold">
                      {p.price.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </label>
                );
              })}
            </div>
            {form.productIds.length > 0 && (
              <p className="text-[10px] text-gray-400 mt-2">
                Soma dos itens:{" "}
                <span className="text-gold-400 font-bold">
                  {form.productIds
                    .reduce((acc, id) => {
                      const pr = products.find((p) => p.id === id);
                      return acc + (pr?.price ?? 0);
                    }, 0)
                    .toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                </span>{" "}
                · Preço do kit:{" "}
                <span className="text-emerald-400 font-bold">
                  {(Number(form.price) || 0).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </p>
            )}
          </div>
          <button
            type="submit"
            className="w-full btn-gold py-3 rounded-xl text-xs uppercase font-bold flex items-center justify-center gap-2"
          >
            <Save size={14} /> Salvar Kit
          </button>
        </form>
      )}

      {/* Kits list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {kits.length === 0 && (
          <div className="glass-panel p-8 rounded-2xl text-center col-span-full">
            <Gift size={32} className="mx-auto mb-2 text-gold-500/40" />
            <p className="text-xs text-gray-400">
              Nenhum kit cadastrado. Clique em &quot;Novo Kit&quot; para criar.
            </p>
          </div>
        )}
        {kits.map((kit) => (
          <div
            key={kit.id}
            className={`glass-panel p-4 rounded-2xl border ${
              kit.active
                ? "border-gold-500/30"
                : "border-gray-700/30 opacity-60"
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-grow">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-white">{kit.name}</h4>
                  {kit.badge && (
                    <span className="text-[9px] bg-gold-500/20 text-gold-300 border border-gold-500/30 rounded-full px-2 py-0.5">
                      {kit.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {kit.description}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleKit(kit.id)}
                  className={`p-1.5 rounded-lg ${
                    kit.active
                      ? "text-emerald-400 hover:bg-emerald-500/10"
                      : "text-gray-500 hover:bg-gray-500/10"
                  }`}
                  title={kit.active ? "Ativo" : "Inativo"}
                >
                  <Power size={14} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Excluir o kit "${kit.name}"?`)) {
                      deleteKit(kit.id);
                      toast.success("Kit removido.");
                    }
                  }}
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"
                  title="Excluir"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {/* Product chips */}
            <div className="flex flex-wrap gap-1 mb-3">
              {kit.productIds.map((id) => (
                <span
                  key={id}
                  className="text-[9px] bg-obsidian-900 text-gold-300 border border-gold-500/20 rounded-full px-2 py-0.5"
                >
                  {productName(id)}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-gold-500/10 pt-2">
              <span className="text-[10px] text-gray-500">
                {kit.productIds.length} produtos
              </span>
              <span className="text-lg font-serif-luxury font-bold text-gold-400">
                {kit.price.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  PROMOTIONS TAB — Manageable special offers (D1-driven)
//  Admin can create/edit/activate/deactivate promotions like
//  "3 decantes R$100", "Black Friday", "Natal", seasonal promos.
// ═══════════════════════════════════════════════════════════
function PromotionsTab() {
  const promotions = usePromotionStore((s) => s.promotions);
  const syncPromotions = usePromotionStore((s) => s.syncPromotionsFromD1);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    id: "",
    title: "",
    subtitle: "",
    description: "",
    badgeText: "R$100",
    eyebrow: "Oferta Especial",
    bundleQty: 3,
    bundlePrice: 100,
    originalPrice: 119.97,
    discountText: "Economia R$19,97",
    imageUrl: "",
    ctaText: "Montar Meu Kit",
    ctaSecondary: "Ver Todos os Decantes",
    isActive: true,
    sortOrder: 0,
    validFrom: "",
    validUntil: "",
  });

  useEffect(() => {
    void syncPromotions();
  }, [syncPromotions]);

  const resetForm = () => {
    setForm({
      id: "",
      title: "",
      subtitle: "",
      description: "",
      badgeText: "R$100",
      eyebrow: "Oferta Especial",
      bundleQty: 3,
      bundlePrice: 100,
      originalPrice: 119.97,
      discountText: "Economia R$19,97",
      imageUrl: "",
      ctaText: "Montar Meu Kit",
      ctaSecondary: "Ver Todos os Decantes",
      isActive: true,
      sortOrder: 0,
      validFrom: "",
      validUntil: "",
    });
    setCreating(false);
    setEditing(null);
  };

  const startEdit = (id: string) => {
    const p = promotions.find((x) => x.id === id);
    if (!p) return;
    setForm({
      id: p.id,
      title: p.title,
      subtitle: p.subtitle || "",
      description: p.description || "",
      badgeText: p.badgeText || "",
      eyebrow: p.eyebrow,
      bundleQty: p.bundleQty,
      bundlePrice: p.bundlePrice,
      originalPrice: p.originalPrice,
      discountText: p.discountText || "",
      imageUrl: p.imageUrl || "",
      ctaText: p.ctaText,
      ctaSecondary: p.ctaSecondary || "",
      isActive: p.isActive,
      sortOrder: p.sortOrder,
      validFrom: p.validFrom || "",
      validUntil: p.validUntil || "",
    });
    setEditing(id);
    setCreating(false);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/db/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id || `promo_${Date.now()}`,
          title: form.title,
          subtitle: form.subtitle || null,
          description: form.description || null,
          badgeText: form.badgeText || null,
          eyebrow: form.eyebrow,
          productIds: [],
          bundleQty: Number(form.bundleQty),
          bundlePrice: Number(form.bundlePrice),
          originalPrice: Number(form.originalPrice),
          discountText: form.discountText || null,
          imageUrl: form.imageUrl || null,
          ctaText: form.ctaText,
          ctaSecondary: form.ctaSecondary || null,
          isActive: form.isActive,
          sortOrder: Number(form.sortOrder),
          validFrom: form.validFrom || null,
          validUntil: form.validUntil || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Promoção salva com sucesso!");
        await syncPromotions();
        resetForm();
      } else {
        toast.error("Erro ao salvar promoção");
      }
    } catch {
      toast.error("Erro de conexão ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: string, current: boolean) => {
    const p = promotions.find((x) => x.id === id);
    if (!p) return;
    try {
      const res = await fetch("/api/db/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...p,
          productIds: p.productIds,
          isActive: !current,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(!current ? "Promoção ativada!" : "Promoção desativada");
        await syncPromotions();
      }
    } catch {
      toast.error("Erro ao alternar promoção");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta promoção?")) return;
    try {
      const res = await fetch(`/api/db/promotions?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("Promoção excluída");
        await syncPromotions();
        if (editing === id) resetForm();
      }
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  const inputCls =
    "w-full bg-obsidian-900/60 border border-gold-500/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gold-500/50";
  const labelCls =
    "text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1 block";

  return (
    <div className="space-y-4">
      <div className="glass-panel p-4 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-serif-luxury text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="text-gold-400" size={18} /> Promoções e Ofertas Especiais
          </h3>
          <button
            onClick={() => {
              resetForm();
              setCreating(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-500 hover:bg-gold-400 text-obsidian-950 text-xs font-bold rounded-lg transition-colors"
          >
            <Plus size={14} /> Nova Promoção
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Gerencie ofertas especiais (3 decantes R$100, Black Friday, Natal, etc.). As promoções
          ativas aparecem automaticamente no staging e na loja principal. Não alteram preços ou
          estoque dos produtos — apenas controlam a exibição da seção de oferta.
        </p>
      </div>

      {/* Form (create/edit) */}
      {(creating || editing) && (
        <div className="glass-panel p-5 rounded-2xl border border-gold-500/30">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-white text-sm">
              {editing ? "Editar Promoção" : "Nova Promoção"}
            </h4>
            <button
              onClick={resetForm}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Título *</label>
              <input
                className={inputCls}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Descubra sua fragrância favorita"
              />
            </div>
            <div>
              <label className={labelCls}>Eyebrow (label pequeno)</label>
              <input
                className={inputCls}
                value={form.eyebrow}
                onChange={(e) => setForm({ ...form, eyebrow: e.target.value })}
                placeholder="Oferta Especial"
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Descrição</label>
              <textarea
                className={inputCls}
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Experimente 3 fragrâncias diferentes em 5ml cada..."
              />
            </div>
            <div>
              <label className={labelCls}>Badge (texto do selo)</label>
              <input
                className={inputCls}
                value={form.badgeText}
                onChange={(e) => setForm({ ...form, badgeText: e.target.value })}
                placeholder="R$100"
              />
            </div>
            <div>
              <label className={labelCls}>Texto de Economia</label>
              <input
                className={inputCls}
                value={form.discountText}
                onChange={(e) => setForm({ ...form, discountText: e.target.value })}
                placeholder="Economia R$19,97"
              />
            </div>
            <div>
              <label className={labelCls}>Qtd no Bundle</label>
              <input
                type="number"
                className={inputCls}
                value={form.bundleQty}
                onChange={(e) => setForm({ ...form, bundleQty: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>Preço Bundle (R$)</label>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                value={form.bundlePrice}
                onChange={(e) => setForm({ ...form, bundlePrice: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>Preço Original (R$)</label>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                value={form.originalPrice}
                onChange={(e) => setForm({ ...form, originalPrice: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>Ordem (menor = primeiro)</label>
              <input
                type="number"
                className={inputCls}
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>CTA Principal</label>
              <input
                className={inputCls}
                value={form.ctaText}
                onChange={(e) => setForm({ ...form, ctaText: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>CTA Secundário</label>
              <input
                className={inputCls}
                value={form.ctaSecondary}
                onChange={(e) => setForm({ ...form, ctaSecondary: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Imagem URL (opcional)</label>
              <input
                className={inputCls}
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div>
              <label className={labelCls}>Válido de (opcional)</label>
              <input
                type="date"
                className={inputCls}
                value={form.validFrom ? form.validFrom.slice(0, 10) : ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    validFrom: e.target.value ? new Date(e.target.value).toISOString() : "",
                  })
                }
              />
            </div>
            <div>
              <label className={labelCls}>Válido até (opcional)</label>
              <input
                type="date"
                className={inputCls}
                value={form.validUntil ? form.validUntil.slice(0, 10) : ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    validUntil: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : "",
                  })
                }
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="w-4 h-4 accent-gold-500"
              />
              <label htmlFor="isActive" className="text-sm text-white">
                Promoção ativa (exibe no site)
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-obsidian-950 text-xs font-bold rounded-lg transition-colors"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {editing ? "Atualizar" : "Criar"} Promoção
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 border border-gray-500/30 hover:border-gray-400 text-gray-300 text-xs font-bold rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Promotions list */}
      <div className="glass-panel p-4 rounded-2xl">
        <h4 className="text-xs uppercase tracking-wider font-bold text-gray-400 mb-3">
          Promoções Cadastradas ({promotions.length})
        </h4>
        {promotions.length === 0 ? (
          <p className="text-sm text-gray-500 italic py-6 text-center">
            Nenhuma promoção cadastrada. Clique em "Nova Promoção" para criar.
          </p>
        ) : (
          <div className="space-y-2">
            {promotions.map((p) => (
              <div
                key={p.id}
                className="bg-obsidian-900/60 rounded-xl p-3 border border-gold-500/10 flex items-start gap-3"
              >
                <div
                  className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    p.isActive ? "bg-green-400" : "bg-gray-600"
                  }`}
                />
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">{p.title}</span>
                    <span className="text-[10px] bg-gold-500/20 text-gold-300 border border-gold-500/20 rounded-full px-2 py-0.5">
                      {p.badgeText}
                    </span>
                    {p.bundleQty > 0 && (
                      <span className="text-[10px] text-gray-400">
                        {p.bundleQty} unids · R${p.bundlePrice}
                      </span>
                    )}
                    {!p.isActive && (
                      <span className="text-[10px] text-gray-500 italic">(inativa)</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                    {p.description}
                  </p>
                  {(p.validFrom || p.validUntil) && (
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      {p.validFrom
                        ? `De ${new Date(p.validFrom).toLocaleDateString("pt-BR")}`
                        : ""}
                      {p.validUntil
                        ? ` até ${new Date(p.validUntil).toLocaleDateString("pt-BR")}`
                        : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggle(p.id, p.isActive)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      p.isActive
                        ? "text-green-400 hover:bg-green-500/10"
                        : "text-gray-500 hover:bg-gray-500/10"
                    }`}
                    title={p.isActive ? "Desativar" : "Ativar"}
                  >
                    <Power size={14} />
                  </button>
                  <button
                    onClick={() => startEdit(p.id)}
                    className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-colors"
                    title="Editar"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  BRANDS TAB — Manageable perfume brands linked to products
//  Admin can create/edit brands and link them to products.
//  The mobile menu (sanduiche) reads brands from D1.
// ═══════════════════════════════════════════════════════════
function BrandsTab({ products }: { products: Perfume[] }) {
  const brands = useBrandStore((s) => s.brands);
  const links = useBrandStore((s) => s.links);
  const syncBrands = useBrandStore((s) => s.syncBrandsFromD1);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkingBrandId, setLinkingBrandId] = useState<string | null>(null);
  const [form, setForm] = useState({
    id: "",
    name: "",
    description: "",
    imageUrl: "",
    isActive: true,
    sortOrder: 0,
  });

  useEffect(() => {
    void syncBrands();
  }, [syncBrands]);

  const resetForm = () => {
    setForm({ id: "", name: "", description: "", imageUrl: "", isActive: true, sortOrder: 0 });
    setCreating(false);
    setEditing(null);
  };

  const startEdit = (b: Brand) => {
    setForm({
      id: b.id,
      name: b.name,
      description: b.description || "",
      imageUrl: b.imageUrl || "",
      isActive: b.isActive,
      sortOrder: b.sortOrder,
    });
    setEditing(b.id);
    setCreating(false);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Nome da marca é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/db/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id || `brand_${Date.now()}`,
          name: form.name.trim(),
          description: form.description || null,
          imageUrl: form.imageUrl || null,
          isActive: form.isActive,
          sortOrder: Number(form.sortOrder),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Marca salva com sucesso!");
        await syncBrands();
        resetForm();
      } else {
        toast.error("Erro ao salvar marca");
      }
    } catch {
      toast.error("Erro de conexão ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: string, current: boolean) => {
    const b = brands.find((x) => x.id === id);
    if (!b) return;
    try {
      const res = await fetch("/api/db/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: b.id,
          name: b.name,
          slug: b.slug,
          description: b.description,
          imageUrl: b.imageUrl,
          isActive: !current,
          sortOrder: b.sortOrder,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(!current ? "Marca ativada!" : "Marca desativada");
        await syncBrands();
      }
    } catch {
      toast.error("Erro ao alternar marca");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta marca? Os produtos não serão afetados, apenas o vínculo será removido.")) return;
    try {
      const res = await fetch(`/api/db/brands?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("Marca excluída");
        await syncBrands();
        if (editing === id) resetForm();
      }
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  // Link/unlink product to brand
  const toggleProductLink = async (brandId: string, productId: string) => {
    const isLinked = links.some((l) => l.brandId === brandId && l.productId === productId);
    try {
      const res = await fetch(`/api/db/brands?${isLinked ? "unlink" : "link"}=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, productId }),
      });
      const data = await res.json();
      if (data.success) {
        await syncBrands();
      }
    } catch {
      toast.error("Erro ao vincular produto");
    }
  };

  // Auto-seed: extract brands from existing products' inspiration field
  const autoSeedFromProducts = async () => {
    if (!confirm("Extrair marcas automaticamente dos produtos atuais? Isso criará marcas baseadas no campo 'inspiração' (ex: 'Cloud Pink (Aerin)' → marca 'Aerin') e vinculará os produtos.")) return;
    setSaving(true);
    try {
      const brandMap = new Map<string, string[]>();
      for (const p of products) {
        const match = p.inspiration?.match(/\(([^()]+)\)\s*$/);
        if (match && match[1]) {
          const brandName = match[1].trim();
          if (!brandMap.has(brandName)) brandMap.set(brandName, []);
          brandMap.get(brandName)!.push(p.id);
        }
      }

      let created = 0;
      for (const [brandName, productIds] of brandMap) {
        const brandId = `brand_${brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
        // Create brand
        const createRes = await fetch("/api/db/brands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: brandId,
            name: brandName,
            isActive: true,
            sortOrder: created,
          }),
        });
        if (createRes.ok) {
          created++;
          // Link products
          for (const productId of productIds) {
            await fetch("/api/db/brands?link=true", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ brandId, productId }),
            });
          }
        }
      }
      toast.success(`${created} marcas criadas e vinculadas aos produtos!`);
      await syncBrands();
    } catch {
      toast.error("Erro ao extrair marcas");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full bg-obsidian-900/60 border border-gold-500/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gold-500/50";
  const labelCls = "text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1 block";

  return (
    <div className="space-y-4">
      <div className="glass-panel p-4 rounded-2xl">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-serif-luxury text-xl font-bold text-white flex items-center gap-2">
            <Tag className="text-gold-400" size={18} /> Marcas de Perfumes
          </h3>
          <div className="flex gap-2">
            <button
              onClick={autoSeedFromProducts}
              disabled={saving || products.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-300 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              <Sparkles size={14} /> Extrair dos Produtos
            </button>
            <button
              onClick={() => { resetForm(); setCreating(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-500 hover:bg-gold-400 text-obsidian-950 text-xs font-bold rounded-lg transition-colors"
            >
              <Plus size={14} /> Nova Marca
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Gerencie marcas de perfumes. As marcas ativas aparecem no menu sanduíche do staging.
          Vincule produtos a cada marca para que o filtro funcione. Clique em "Extrair dos Produtos"
          para criar marcas automaticamente baseadas no campo inspiração (ex: "Cloud Pink (Aerin)" → marca "Aerin").
        </p>
      </div>

      {/* Form (create/edit) */}
      {(creating || editing) && (
        <div className="glass-panel p-5 rounded-2xl border border-gold-500/30">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-white text-sm">
              {editing ? "Editar Marca" : "Nova Marca"}
            </h4>
            <button onClick={resetForm} className="text-gray-400 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Nome da Marca *</label>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Dior, Aerin, Lattafa"
              />
            </div>
            <div>
              <label className={labelCls}>Ordem (menor = primeiro)</label>
              <input
                type="number"
                className={inputCls}
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Descrição (opcional)</label>
              <input
                className={inputCls}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Breve descrição da marca"
              />
            </div>
            <div>
              <label className={labelCls}>Imagem URL (opcional)</label>
              <input
                className={inputCls}
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="brandActive"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="w-4 h-4 accent-gold-500"
              />
              <label htmlFor="brandActive" className="text-sm text-white">Marca ativa (exibe no menu)</label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-obsidian-950 text-xs font-bold rounded-lg transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {editing ? "Atualizar" : "Criar"} Marca
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 border border-gray-500/30 hover:border-gray-400 text-gray-300 text-xs font-bold rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Brands list */}
      <div className="glass-panel p-4 rounded-2xl">
        <h4 className="text-xs uppercase tracking-wider font-bold text-gray-400 mb-3">
          Marcas Cadastradas ({brands.length})
        </h4>
        {brands.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 italic mb-3">Nenhuma marca cadastrada ainda.</p>
            <button
              onClick={autoSeedFromProducts}
              disabled={saving || products.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-300 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              <Sparkles size={14} /> Extrair dos Produtos Agora
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {brands.map((b) => {
              const linkedProducts = links.filter((l) => l.brandId === b.id);
              return (
                <div key={b.id} className="bg-obsidian-900/60 rounded-xl p-3 border border-gold-500/10">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${b.isActive ? "bg-green-400" : "bg-gray-600"}`}
                    />
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">{b.name}</span>
                        <span className="text-[10px] bg-gold-500/20 text-gold-300 border border-gold-500/20 rounded-full px-2 py-0.5">
                          {b.productCount} produtos
                        </span>
                        {!b.isActive && (
                          <span className="text-[10px] text-gray-500 italic">(inativa)</span>
                        )}
                      </div>
                      {b.description && (
                        <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{b.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggle(b.id, b.isActive)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          b.isActive ? "text-green-400 hover:bg-green-500/10" : "text-gray-500 hover:bg-gray-500/10"
                        }`}
                        title={b.isActive ? "Desativar" : "Ativar"}
                      >
                        <Power size={14} />
                      </button>
                      <button
                        onClick={() => startEdit(b)}
                        className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-colors"
                        title="Editar"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => remove(b.id)}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                      <button
                        onClick={() => setLinkingBrandId(linkingBrandId === b.id ? null : b.id)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          linkingBrandId === b.id
                            ? "text-gold-400 bg-gold-500/10"
                            : "text-gray-400 hover:bg-gray-500/10"
                        }`}
                        title="Vincular produtos"
                      >
                        <Layers size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Product linking panel */}
                  {linkingBrandId === b.id && (
                    <div className="mt-3 pt-3 border-t border-gold-500/10">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2">
                        Vincular Produtos à marca "{b.name}"
                      </p>
                      <div className="max-h-60 overflow-y-auto space-y-1">
                        {products.length === 0 ? (
                          <p className="text-xs text-gray-500 italic py-2">Nenhum produto cadastrado.</p>
                        ) : (
                          products.map((p) => {
                            const isLinked = linkedProducts.some((l) => l.productId === p.id);
                            return (
                              <label
                                key={p.id}
                                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-obsidian-900/60 cursor-pointer transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={isLinked}
                                  onChange={() => toggleProductLink(b.id, p.id)}
                                  className="w-4 h-4 accent-gold-500"
                                />
                                <img
                                  src={p.image}
                                  alt={p.name}
                                  className="w-8 h-8 object-contain rounded bg-obsidian-950 p-0.5"
                                />
                                <div className="flex-grow min-w-0">
                                  <p className="text-[11px] font-bold text-white truncate">{p.name}</p>
                                  <p className="text-[9px] text-gray-500 truncate">
                                    {p.code} • {p.inspiration}
                                  </p>
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  MARQUEE TAB — Edit marquee bar text (stored in D1 settings)
// ═══════════════════════════════════════════════════════════
function MarqueeTab() {
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/db/marquee");
        const data = await res.json();
        if (data?.success && Array.isArray(data.items)) {
          setItems(data.items);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const validItems = items.filter((i) => i.trim());
      const res = await fetch("/api/db/marquee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: validItems }),
      });
      const data = await res.json();
      if (data.success) {
        setItems(validItems);
        toast.success("Marquee atualizada!");
      } else {
        toast.error("Erro ao salvar marquee");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    setItems(newItems);
  };

  const addItem = () => setItems([...items, ""]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const inputCls =
    "w-full bg-obsidian-900/60 border border-gold-500/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gold-500/50";

  return (
    <div className="glass-panel p-5 rounded-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif-luxury text-xl font-bold text-white flex items-center gap-2">
          <Sparkles className="text-gold-400" size={18} /> Barra Rolante (Marquee)
        </h3>
        <button
          onClick={save}
          disabled={saving || loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-obsidian-950 text-xs font-bold rounded-lg transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar
        </button>
      </div>
      <p className="text-xs text-gray-400">
        Edite os textos que aparecem na barra rolante no topo do site. Cada item é separado por um ponto (·) na exibição.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-gold-400" />
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 w-6">{i + 1}.</span>
              <input
                type="text"
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
                placeholder="Digite o texto da marquee..."
                className={inputCls}
              />
              <button
                onClick={() => removeItem(i)}
                className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                aria-label="Remover item"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={addItem}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gold-500/30 hover:bg-gold-500/10 text-gold-300 text-xs font-bold rounded-lg transition-colors"
          >
            <Plus size={14} /> Adicionar Item
          </button>
        </div>
      )}

      {/* Preview */}
      {items.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gold-500/10">
          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2">Prévia</p>
          <div className="bg-obsidian-950 rounded-lg p-3 overflow-hidden">
            <div className="flex items-center gap-0 whitespace-nowrap overflow-hidden">
              {items.map((text, i) => (
                <span key={i} className="flex items-center">
                  <span className="text-xs tracking-[0.18em] uppercase mx-4 text-gray-400">{text}</span>
                  <span className="text-xs tracking-[0.18em] uppercase mx-4 text-gold-500/60">·</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Gift wrap configuration */}
      <GiftWrapConfig />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  GIFT WRAP CONFIG — enable/disable + price (stored in D1)
// ═══════════════════════════════════════════════════════════
function GiftWrapConfig() {
  const [enabled, setEnabled] = useState(false);
  const [price, setPrice] = useState(5.0);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/db/gift-wrap");
        const data = await res.json();
        if (data?.success) {
          setEnabled(data.enabled);
          setPrice(data.price);
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/db/gift-wrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, price: Number(price) }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Embalagem para presente atualizada!");
      }
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  const inputCls = "w-full bg-obsidian-900/60 border border-gold-500/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gold-500/50";

  return (
    <div className="mt-4 pt-4 border-t border-gold-500/10">
      <div className="flex items-center gap-2 mb-3">
        <Gift size={16} className="text-purple-400" />
        <h4 className="text-sm font-bold text-white">Embalagem para Presente</h4>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Ative para mostrar a opção de embrulho para presente no carrinho. O valor é cobrado adicionalmente.
      </p>
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 accent-gold-500"
          />
          <span className="text-sm text-white">Ativar embrulho para presente</span>
        </label>
        {enabled && (
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Valor (R$)</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className={`${inputCls} w-24`}
            />
          </div>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-obsidian-950 text-xs font-bold rounded-lg transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar
        </button>
      </div>
    </div>
  );
}
