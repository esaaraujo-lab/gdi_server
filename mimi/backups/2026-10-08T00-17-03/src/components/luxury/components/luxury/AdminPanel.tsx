"use client";

import { useState, useEffect } from "react";
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
import { useContentStore, type ContentState } from "@/lib/content-store";
import { useKitStore } from "@/lib/kit-store";
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
  FileText,
  RotateCcw,
  Megaphone,
  Timer,
  Package,
  Gift,
} from "lucide-react";

type Tab =
  | "products"
  | "add"
  | "categories"
  | "coupons"
  | "kits"
  | "reviews"
  | "pinned"
  | "content"
  | "conversion"
  | "pix"
  | "leads"
  | "subscriptions";

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
  const updateStockQty = useStore((s) => s.updateStockQty);
  const deleteProduct = useStore((s) => s.deleteProduct);
  const addProduct = useStore((s) => s.addProduct);
  const applyGlobalPrice = useStore((s) => s.applyGlobalPrice);
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
  const syncReviewsFromD1 = useReviewStore((s) => s.syncReviewsFromD1);

  const coupons = useCouponStore((s) => s.coupons);
  const addCoupon = useCouponStore((s) => s.addCoupon);
  const toggleCoupon = useCouponStore((s) => s.toggleCoupon);
  const deleteCoupon = useCouponStore((s) => s.deleteCoupon);

  // Kits store — admin creates promotional bundles (2-3 perfumes for special price)
  const kits = useKitStore((s) => s.kits);

  // D1 SYNC — when admin panel opens, refresh reviews (all products) from D1
  // so the admin sees the latest cross-device state instead of stale cache.
  // Non-blocking; localStorage cache renders instantly while D1 overwrites.
  useEffect(() => {
    if (!open) return;
    void syncReviewsFromD1().catch((err) =>
      console.warn("[D1 sync] admin open reviews failed:", err)
    );
  }, [open, syncReviewsFromD1]);

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
    fixation: "8 a 10h",
    rating: 5,
    reviewCount: 0,
    season: "",
    occasion: "",
  });

  const [pixForm, setPixForm] = useState(pixConfig);

  if (!open) return null;

  const tabs: { id: Tab; label: string; icon: typeof Store }[] = [
    { id: "products", label: "Produtos", icon: Store },
    { id: "add", label: "Adicionar", icon: Plus },
    { id: "categories", label: "Categorias", icon: Layers },
    { id: "coupons", label: `Cupons (${coupons.filter((c) => c.active).length})`, icon: Ticket },
    { id: "kits", label: `Kits (${kits.filter((k) => k.active).length})`, icon: Gift },
    { id: "reviews", label: `Avaliações (${allReviews.length})`, icon: Star },
    { id: "pinned", label: "Destaque", icon: Pin },
    { id: "content", label: "Conteúdo", icon: FileText },
    { id: "conversion", label: "Conversão", icon: Megaphone },
    { id: "pix", label: "Pix", icon: CreditCard },
    { id: "leads", label: "Leads", icon: Phone },
    { id: "subscriptions", label: "Assinaturas", icon: Crown },
  ];

  const startEdit = (p: Perfume) => {
    setEditingId(p.id);
    setEditForm({ ...p });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const updates: Partial<Perfume> = { ...editForm };
    // Auto-prepend GitHub URL if image is just filename
    if (updates.image && !updates.image.startsWith("http") && !updates.image.startsWith("/")) {
      updates.image = `https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/${updates.image}`;
    }
    updateProduct(editingId, updates);
    toast.success("Produto atualizado!");
    setEditingId(null);
    setEditForm({});
  };

  const handleAdd = (e: React.FormEvent) => {
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
        : `https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/${form.image}`,
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
    };
    addProduct(newObj);
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
    <div className="fixed inset-0 z-[70] bg-obsidian-950 overflow-y-auto overflow-x-hidden">
      <div className="max-w-full mx-auto p-3 sm:p-4 lg:p-6 safe-top">
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
          <button onClick={() => {
            setOpen(false);
            // Re-sync from D1 after 500ms (allows pending PATCHes to complete)
            setTimeout(() => {
              const sync = useStore.getState?.()?.syncFromD1;
              if (sync) void sync().catch(() => {});
            }, 500);
          }} className="btn-gold px-5 py-2 rounded-xl text-xs uppercase flex items-center gap-2">
            <Store size={14} /> Voltar à Loja
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 sm:gap-2 border-b border-gold-500/10 mb-6 overflow-x-auto pb-2 scrollbar-thin">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-2.5 sm:px-4 py-2 rounded-xl text-[10px] sm:text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                tab === t.id
                  ? "bg-gold-500 text-obsidian-950"
                  : "bg-obsidian-900 text-gray-300 border border-gold-500/20 hover:border-gold-500/50"
              }`}
            >
              <t.icon size={12} className="sm:hidden" />
              <t.icon size={14} className="hidden sm:block" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(" ")[0]}</span>
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

            {/* Products list — responsive card layout */}
            <div className="space-y-2">
              {products.map((p) => (
                <div key={p.id} className="glass-panel rounded-xl p-3 border border-gold-500/10">
                  {/* Product row — flex layout that wraps on mobile */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    {/* Image + name */}
                    <div className="flex items-center gap-2 flex-grow min-w-0 sm:flex-initial sm:w-48">
                      <img src={p.image} alt={p.name} className="w-8 h-8 rounded object-cover shrink-0" loading="lazy" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{p.name}</p>
                        <p className="text-[9px] text-gray-500">{p.code} • {p.category}</p>
                      </div>
                    </div>
                    {/* Price */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] text-gray-500 uppercase hidden sm:inline">Preço:</span>
                      <input
                        type="number"
                        step="0.01"
                        value={p.price}
                        onChange={(e) => updateProductPrice(p.id, parseFloat(e.target.value))}
                        className="w-16 sm:w-20 bg-obsidian-900 border border-gold-500/30 rounded py-1 px-2 text-xs text-gold-400 font-bold"
                      />
                    </div>
                    {/* Stock qty */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] text-gray-500 uppercase hidden sm:inline">Qtd:</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={p.stockQty ?? 0}
                        onChange={(e) => {
                          const qty = parseInt(e.target.value) || 0;
                          updateStockQty(p.id, qty);
                        }}
                        className={`w-14 sm:w-16 bg-obsidian-900 border rounded py-1 px-2 text-xs font-bold text-center ${
                          (p.stockQty ?? 0) === 0
                            ? "border-red-500/40 text-red-400"
                            : (p.stockQty ?? 0) <= 5
                            ? "border-amber-500/40 text-amber-400"
                            : "border-gold-500/30 text-emerald-400"
                        }`}
                      />
                      <button
                        onClick={() => { toggleStock(p.id); toast.success("Estoque atualizado."); }}
                        className={`px-2 py-1 rounded-full text-[9px] font-bold border whitespace-nowrap ${
                          p.inStock
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : "bg-red-500/20 text-red-400 border-red-500/30"
                        }`}
                      >
                        {p.inStock ? "✓" : "✗"}
                      </button>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 ml-auto">
                      <button onClick={() => startEdit(p)} className="text-gold-400 hover:underline text-xs px-2 py-1 rounded">
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Excluir este perfume?")) {
                            deleteProduct(p.id);
                            toast.success("Perfume removido.");
                          }
                        }}
                        className="text-red-400 hover:underline text-xs px-2 py-1 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {/* Edit form */}
                  {editingId === p.id && (
                    <div className="mt-3 pt-3 border-t border-gold-500/15">
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
                    </div>
                  )}
                </div>
              ))}
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
              <div><label className={labelCls}>Imagem (nome do arquivo ou URL)</label><input type="text" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="bc-999.jpg ou https://..." required className={inputCls} /></div>
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

        {/* TAB: CONTENT (Edição de textos da interface) */}
        {tab === "content" && <ContentEditor />}

        {/* TAB: CONVERSION (Announcement bar + urgency timer) */}
        {tab === "conversion" && <ConversionTools />}

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

        {/* TAB: LEADS — reads from D1 */}
        {tab === "leads" && <LeadsTab />}

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

        {/* TAB: KITS (Promotional bundles — 2-3 perfumes for a special price) */}
        {tab === "kits" && <KitsTab />}

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
// ============================================================================
//
// Persistência híbrida:
//   - localStorage (chave "mimi-pinned-product") — cache para render rápida.
//   - Cloudflare D1 (tabela `pinned`) — source of truth, sincronizada entre
//     dispositivos via /api/db/pinned.
//
// O `PinnedProductBanner` (na home) lê apenas do localStorage — por isso o
// helper `syncPinnedFromD1()` faz o fetch no mount da app e materializa o
// resultado no localStorage, mantendo o reader existente sem mudanças.

const PINNED_LS_KEY = "mimi-pinned-product";
const PINNED_BADGES = ["Imperdível", "Promoção", "Novidade", "Últimas Unidades"] as const;

function loadPinnedConfig(): { productId: string; badge: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PINNED_LS_KEY);
    if (!raw || raw === "false") return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.productId ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Save pinned config to localStorage AND D1 (fire-and-forget).
 * Passing `null` clears both localStorage and the D1 row.
 */
function savePinnedConfig(config: { productId: string; badge: string } | null) {
  if (typeof window === "undefined") return;
  if (config === null) {
    localStorage.setItem(PINNED_LS_KEY, "false");
    // D1 SYNC — DELETE pinned row (fire-and-forget)
    void fetch("/api/db/pinned", { method: "DELETE" })
      .then((res) => {
        if (!res.ok) console.warn("[D1 sync] pinned DELETE HTTP", res.status);
      })
      .catch((err) => console.warn("[D1 sync] pinned DELETE failed:", err));
  } else {
    localStorage.setItem(PINNED_LS_KEY, JSON.stringify(config));
    // D1 SYNC — POST pinned config (fire-and-forget)
    void fetch("/api/db/pinned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: config.productId, badge: config.badge }),
    })
      .then((res) => {
        if (!res.ok) console.warn("[D1 sync] pinned POST HTTP", res.status);
      })
      .catch((err) => console.warn("[D1 sync] pinned POST failed:", err));
  }
}

/**
 * Fetch pinned config from D1 and materialize it into localStorage so
 * existing readers (PinnedProductBanner) get the cross-device value
 * without any code change. Called once on app mount.
 *
 * On failure (D1 down, network error, malformed payload), no-ops — the
 * localStorage cache (or hardcoded DEFAULT_PINNED in PinnedProductBanner)
 * keeps the UI working.
 */
export async function syncPinnedFromD1(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/db/pinned", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    if (!data?.success || !data.pinned) return;
    const p = data.pinned;
    const productId = typeof p.product_id === "string"
      ? p.product_id
      : typeof p.productId === "string"
      ? p.productId
      : "";
    if (!productId) return;
    const badge = typeof p.badge === "string" && p.badge ? p.badge : "Imperdível";
    const config = { productId, badge };
    localStorage.setItem(PINNED_LS_KEY, JSON.stringify(config));
    // Notify same-tab listeners (PinnedProductBanner, PinnedPreview, PinnedForm)
    window.dispatchEvent(new Event("pinned-updated"));
  } catch (err) {
    console.warn("[D1 sync] pinned sync failed:", err);
  }
}

function PinnedPreview() {
  // Lazy initial state from localStorage — avoids setState-in-effect
  const [config, setConfig] = useState<{
    productId: string;
    badge: string;
  } | null>(() => loadPinnedConfig());
  // Listen for storage changes (e.g., when admin clicks Save in PinnedForm below)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PINNED_LS_KEY) {
        setConfig(loadPinnedConfig());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Manual refresh function (since same-tab localStorage writes don't fire events)
  // PinnedForm below calls window.dispatchEvent(new StorageEvent(...)) after save
  useEffect(() => {
    const refresh = () => setConfig(loadPinnedConfig());
    window.addEventListener("pinned-updated", refresh);
    return () => window.removeEventListener("pinned-updated", refresh);
  }, []);

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
  const [productId, setProductId] = useState(
    () => loadPinnedConfig()?.productId || products[0]?.id || ""
  );
  const [badge, setBadge] = useState<string>(
    () => loadPinnedConfig()?.badge || "Imperdível"
  );

  // Listen for pinned updates from PinnedPreview or other components
  useEffect(() => {
    const refresh = () => {
      const current = loadPinnedConfig();
      if (current) {
        setProductId(current.productId);
        setBadge(current.badge);
      }
    };
    window.addEventListener("pinned-updated", refresh);
    return () => window.removeEventListener("pinned-updated", refresh);
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
// CONTENT EDITOR — editar textos da interface (Hero, banners, FAQ, etc)
// ============================================================================

interface ContentField {
  key: keyof ContentState;
  label: string;
  type: "text" | "textarea";
  section: string;
}

const CONTENT_FIELDS: ContentField[] = [
  // Hero
  { key: "heroBadge", label: "Badge (acima do título)", type: "text", section: "Hero / Seção Principal" },
  { key: "heroTitleLine1", label: "Título - Linha 1", type: "text", section: "Hero / Seção Principal" },
  { key: "heroTitleLine2", label: "Título - Linha 2 (destaque dourado)", type: "text", section: "Hero / Seção Principal" },
  { key: "heroDescription", label: "Descrição do Hero", type: "textarea", section: "Hero / Seção Principal" },
  { key: "heroPriceLabel", label: "Label do Preço", type: "text", section: "Hero / Seção Principal" },
  { key: "heroCtaText", label: "Texto do Botão CTA", type: "text", section: "Hero / Seção Principal" },
  // Seasonal Banner
  { key: "seasonalTitle", label: "Título do Banner", type: "text", section: "Banner Sazonal" },
  { key: "seasonalDesc", label: "Descrição do Banner", type: "textarea", section: "Banner Sazonal" },
  { key: "seasonalCtaText", label: "Texto do Botão", type: "text", section: "Banner Sazonal" },
  // Trust Badges
  { key: "trustSectionTitle", label: "Título da Seção", type: "text", section: "Selos de Confiança" },
  { key: "trustBadge1Title", label: "Selo 1 - Título", type: "text", section: "Selos de Confiança" },
  { key: "trustBadge1Desc", label: "Selo 1 - Descrição", type: "text", section: "Selos de Confiança" },
  { key: "trustBadge2Title", label: "Selo 2 - Título", type: "text", section: "Selos de Confiança" },
  { key: "trustBadge2Desc", label: "Selo 2 - Descrição", type: "text", section: "Selos de Confiança" },
  { key: "trustBadge3Title", label: "Selo 3 - Título", type: "text", section: "Selos de Confiança" },
  { key: "trustBadge3Desc", label: "Selo 3 - Descrição", type: "text", section: "Selos de Confiança" },
  { key: "trustBadge4Title", label: "Selo 4 - Título (Fixação)", type: "text", section: "Selos de Confiança" },
  { key: "trustBadge4Desc", label: "Selo 4 - Descrição", type: "text", section: "Selos de Confiança" },
  { key: "trustBadge5Title", label: "Selo 5 - Título", type: "text", section: "Selos de Confiança" },
  { key: "trustBadge5Desc", label: "Selo 5 - Descrição", type: "text", section: "Selos de Confiança" },
  { key: "trustBadge6Title", label: "Selo 6 - Título", type: "text", section: "Selos de Confiança" },
  { key: "trustBadge6Desc", label: "Selo 6 - Descrição", type: "text", section: "Selos de Confiança" },
  // FAQ
  { key: "faqTitle", label: "Título do FAQ", type: "text", section: "FAQ" },
  { key: "faqDescription", label: "Descrição do FAQ", type: "textarea", section: "FAQ" },
  // Newsletter
  { key: "newsletterBadge", label: "Badge", type: "text", section: "Newsletter" },
  { key: "newsletterTitle", label: "Título", type: "text", section: "Newsletter" },
  { key: "newsletterDescription", label: "Descrição", type: "textarea", section: "Newsletter" },
  // Fixação
  { key: "fixationText", label: "Texto da Fixação", type: "text", section: "Informações Técnicas" },
  { key: "fixationDesc", label: "Descrição da Fixação", type: "textarea", section: "Informações Técnicas" },
  // Cart texts
  { key: "cartTitle", label: "Título do Carrinho", type: "text", section: "Carrinho" },
  { key: "cartEmpty", label: "Mensagem de Carrinho Vazio", type: "text", section: "Carrinho" },
  { key: "cartCtaText", label: "Botão Finalizar", type: "text", section: "Carrinho" },
  { key: "cartCustomerDataLabel", label: "Label Dados do Cliente", type: "text", section: "Carrinho" },
  { key: "cartShippingLabel", label: "Label Entrega/Retirada", type: "text", section: "Carrinho" },
  { key: "cartCouponLabel", label: "Label Cupom de Desconto", type: "text", section: "Carrinho" },
  { key: "cartGiftWrapTitle", label: "Título Embrulho Presente", type: "text", section: "Carrinho" },
  { key: "cartGiftWrapDesc", label: "Descrição Embrulho Presente", type: "text", section: "Carrinho" },
  { key: "cartSubtotalLabel", label: "Label Subtotal", type: "text", section: "Carrinho" },
  { key: "cartShippingLabel2", label: "Label Frete", type: "text", section: "Carrinho" },
  { key: "cartTotalLabel", label: "Label Total", type: "text", section: "Carrinho" },
  { key: "cartYouSaveLabel", label: "Label Você Economiza", type: "text", section: "Carrinho" },
  // PixModal texts
  { key: "pixTitle", label: "Título do Modal Pix", type: "text", section: "Modal de Pagamento Pix" },
  { key: "pixSubtitle", label: "Subtítulo", type: "text", section: "Modal de Pagamento Pix" },
  { key: "pixSummaryLabel", label: "Label do Resumo", type: "text", section: "Modal de Pagamento Pix" },
  { key: "pixTotalLabel", label: "Label Total a Pagar", type: "text", section: "Modal de Pagamento Pix" },
  { key: "pixCtaText", label: "Texto do Botão Confirmar", type: "textarea", section: "Modal de Pagamento Pix" },
  { key: "pixCtaDesc", label: "Descrição abaixo do botão", type: "textarea", section: "Modal de Pagamento Pix" },
  { key: "pixCopyLabel", label: "Label Código Copia e Cola", type: "text", section: "Modal de Pagamento Pix" },
  { key: "pixCopyBtn", label: "Botão Copiar", type: "text", section: "Modal de Pagamento Pix" },
  { key: "pixCopiedBtn", label: "Botão Copiado", type: "text", section: "Modal de Pagamento Pix" },
  { key: "pixWaitingText", label: "Texto Aguardando Pagamento", type: "text", section: "Modal de Pagamento Pix" },
];

function ContentEditor() {
  const content = useContentStore();
  const updateField = useContentStore((s) => s.updateField);
  const resetAll = useContentStore((s) => s.resetAll);

  // Agrupa campos por seção
  const sections = CONTENT_FIELDS.reduce((acc, field) => {
    if (!acc[field.section]) acc[field.section] = [];
    acc[field.section].push(field);
    return acc;
  }, {} as Record<string, ContentField[]>);

  const inputCls = "w-full bg-obsidian-900 border border-gold-500/30 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-gold-400";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-panel p-5 rounded-2xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center text-gold-400 shrink-0">
            <FileText size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="font-serif-luxury text-xl font-bold text-white">
              Editar Conteúdo
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Altere textos de banners, títulos, descrições e selos. Mudanças são salvas automaticamente e visíveis na página principal.
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            if (confirm("Resetar TODOS os textos para os valores padrão? Esta ação não pode ser desfeita.")) {
              resetAll();
              toast.success("Conteúdo resetado para os valores padrão.");
            }
          }}
          className="text-[10px] uppercase tracking-wider text-red-400 hover:text-red-300 px-3 py-2 rounded-lg border border-red-500/30 hover:bg-red-500/10 transition-all flex items-center gap-1.5 shrink-0"
        >
          <RotateCcw size={11} /> Resetar
        </button>
      </div>

      {/* Seções de conteúdo */}
      {Object.entries(sections).map(([sectionName, fields]) => (
        <div key={sectionName} className="glass-panel p-5 rounded-2xl">
          <h4 className="text-xs uppercase tracking-wider text-gold-300 font-bold mb-3 pb-2 border-b border-gold-500/15 flex items-center gap-2">
            <FileText size={13} className="text-gold-400" />
            {sectionName}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fields.map((field) => (
              <div key={field.key} className={field.type === "textarea" ? "sm:col-span-2" : ""}>
                <label className="block text-[10px] text-gold-300 mb-1 uppercase tracking-wider font-bold">
                  {field.label}
                </label>
                {field.type === "textarea" ? (
                  <textarea
                    value={content[field.key]}
                    onChange={(e) => {
                      updateField(field.key, e.target.value);
                    }}
                    rows={2}
                    className={inputCls + " resize-none"}
                  />
                ) : (
                  <input
                    type="text"
                    value={content[field.key]}
                    onChange={(e) => {
                      updateField(field.key, e.target.value);
                    }}
                    className={inputCls}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Auto-save notice */}
      <div className="text-center text-[10px] text-gray-500">
        💡 Mudanças são salvas automaticamente. Recarregue a página principal para ver os textos atualizados.
      </div>
    </div>
  );
}

// ============================================================================
// CONVERSION TOOLS — announcement bar editor + urgency countdown timer.
// Both persist via the content store (which dual-writes to localStorage + D1
// under the keys `announcementText`, `urgencyTimerEnabled`, `urgencyTimerHours`).
// ============================================================================

function ConversionTools() {
  const content = useContentStore();
  const updateField = useContentStore((s) => s.updateField);

  const inputCls =
    "w-full bg-obsidian-900 border border-gold-500/30 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-gold-400";
  const labelCls = "block text-[10px] text-gold-300 mb-1 uppercase tracking-wider";

  const urgencyEnabled = String(content.urgencyTimerEnabled).toLowerCase() === "true";
  const urgencyHours = Number(content.urgencyTimerHours) || 12;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="glass-panel p-5 rounded-2xl flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center text-gold-400 shrink-0">
          <Megaphone size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="font-serif-luxury text-xl font-bold text-white">
            Ferramentas de Conversão
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Anúncio no topo da loja + cronômetro de urgência para acelerar a decisão de compra.
            Salvo no banco de dados (D1) e sincronizado entre dispositivos.
          </p>
        </div>
      </div>

      {/* Announcement bar editor */}
      <div className="glass-panel p-5 rounded-2xl">
        <h4 className="text-xs uppercase tracking-wider text-gold-300 font-bold mb-3 pb-2 border-b border-gold-500/15 flex items-center gap-2">
          <Megaphone size={13} className="text-gold-400" />
          Barra de Anúncio (topo do site)
        </h4>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Texto do anúncio</label>
            <input
              type="text"
              value={content.announcementText}
              onChange={(e) => updateField("announcementText", e.target.value)}
              placeholder="Ex: Frete grátis acima de R$ 100 • Pix com desconto"
              className={inputCls}
              maxLength={140}
            />
            <p className="text-[9px] text-gray-500 mt-1">
              {content.announcementText.length}/140 caracteres • aparece em todas as
              páginas no topo da loja, acima do cabeçalho.
            </p>
          </div>
          <div className="bg-obsidian-900/60 border border-gold-500/15 rounded-xl p-3">
            <p className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">
              Pré-visualização
            </p>
            <div className="text-gold-200 text-[11px] py-1.5 text-center tracking-widest uppercase flex justify-center items-center gap-2">
              <Crown className="text-gold-400" size={11} />
              <span>
                {content.announcementText && content.announcementText.trim().length > 0
                  ? content.announcementText
                  : "Mimi Mimos • Perfumaria Árabe & Importados"}
              </span>
              <Crown className="text-gold-400" size={11} />
            </div>
          </div>
          <button
            onClick={() => {
              updateField(
                "announcementText",
                "Frete grátis acima de R$ 100 • Pix com desconto"
              );
              toast.success("Texto padrão restaurado.");
            }}
            className="text-[10px] uppercase tracking-wider text-gray-400 hover:text-gold-300 flex items-center gap-1"
          >
            <RotateCcw size={11} /> Restaurar padrão
          </button>
        </div>
      </div>

      {/* Urgency timer editor */}
      <div className="glass-panel p-5 rounded-2xl">
        <h4 className="text-xs uppercase tracking-wider text-gold-300 font-bold mb-3 pb-2 border-b border-gold-500/15 flex items-center gap-2">
          <Timer size={13} className="text-gold-400" />
          Cronômetro de Urgência (Oferta Termina em…)
        </h4>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer group">
            <button
              type="button"
              role="switch"
              aria-checked={urgencyEnabled}
              onClick={() => {
                updateField("urgencyTimerEnabled", urgencyEnabled ? "false" : "true");
                toast.success(
                  urgencyEnabled
                    ? "Cronômetro de urgência desativado."
                    : "Cronômetro de urgência ativado! Banner aparece no topo da loja."
                );
              }}
              className={`relative w-11 h-6 rounded-full transition-all shrink-0 ${
                urgencyEnabled
                  ? "bg-emerald-500/80 border border-emerald-400/50"
                  : "bg-obsidian-800 border border-gold-500/30"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  urgencyEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <div>
              <p className="text-xs text-white font-bold">
                Ativar cronômetro de urgência
              </p>
              <p className="text-[10px] text-gray-400">
                Mostra um banner flutuante com "Oferta termina em HH:MM:SS".
              </p>
            </div>
          </label>

          <div>
            <label className={labelCls}>Duração da oferta (horas)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="168"
                step="1"
                value={urgencyHours}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  updateField(
                    "urgencyTimerHours",
                    Number.isFinite(v) && v > 0 ? String(Math.min(v, 168)) : "12"
                  );
                }}
                disabled={!urgencyEnabled}
                className={`${inputCls} w-24 text-center font-bold ${
                  !urgencyEnabled ? "opacity-50 cursor-not-allowed" : ""
                }`}
              />
              <span className="text-[10px] text-gray-400">
                horas (1–168). Ao ativar, o cronômetro começa a contar a partir do
                primeiro acesso após salvar.
              </span>
            </div>
          </div>

          {/* Live preview */}
          <div
            className={`rounded-xl p-3 border transition-all ${
              urgencyEnabled
                ? "bg-red-950/40 border-red-500/40"
                : "bg-obsidian-900/60 border-gold-500/15 opacity-60"
            }`}
          >
            <p className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">
              Pré-visualização do banner
            </p>
            <div className="flex items-center justify-center gap-2 text-xs">
              <Timer size={14} className={urgencyEnabled ? "text-red-300" : "text-gray-500"} />
              <span className={urgencyEnabled ? "text-red-200" : "text-gray-400"}>
                Oferta termina em{" "}
                <span className="font-mono font-bold">
                  {String(urgencyHours).padStart(2, "0")}:00:00
                </span>
              </span>
            </div>
          </div>

          <p className="text-[10px] text-gray-500 flex items-center gap-1.5">
            💡 O banner aparece automaticamente no topo da loja quando ativo.
            Persistência: <code className="text-gold-400/80">urgencyTimerEnabled</code> e{" "}
            <code className="text-gold-400/80">urgencyTimerHours</code> no D1 (tabela{" "}
            <code className="text-gold-400/80">content</code>).
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LEADS TAB — reads leads from D1 database
// ============================================================================

function LeadsTab() {
  const [d1Leads, setD1Leads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/db/leads");
      const data = await res.json();
      if (data.success && Array.isArray(data.leads)) {
        setD1Leads(data.leads);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  };

  useEffect(() => {
    // Fetch leads on mount — async, doesn't block render
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/db/leads");
        const data = await res.json();
        if (active && data.success && Array.isArray(data.leads)) {
          setD1Leads(data.leads);
        }
      } catch {
        /* ignore */
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const handleClear = async () => {
    if (!confirm("Limpar TODOS os leads do banco de dados?")) return;
    try {
      await fetch("/api/db/leads", { method: "DELETE" });
      setD1Leads([]);
      toast.success("Leads limpos do banco de dados.");
    } catch {
      toast.error("Erro ao limpar leads.");
    }
  };

  return (
    <div className="glass-panel p-4 sm:p-6 rounded-2xl">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-serif-luxury text-xl font-bold text-white flex items-center gap-2">
            <Phone className="text-gold-400" size={18} /> Leads do Banco de Dados
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {d1Leads.length} lead(s) capturado(s) via D1 — todos dispositivos
          </p>
        </div>
        {d1Leads.length > 0 && (
          <button
            onClick={handleClear}
            className="text-xs text-red-400 hover:underline flex items-center gap-1 shrink-0"
          >
            <Eraser size={12} /> Limpar Tudo
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">
          <div className="w-6 h-6 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs">Carregando leads do banco...</p>
        </div>
      ) : d1Leads.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Phone className="mx-auto mb-2 text-gold-500/30" size={28} />
          <p className="text-xs">Nenhum lead capturado ainda.</p>
          <p className="text-[10px] text-gray-600 mt-1">
            Leads aparecerão aqui quando clientes usarem o "Avise-me"
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {d1Leads.map((l, i) => (
            <div
              key={l.id || i}
              className="glass-panel rounded-xl p-3 border border-gold-500/10 flex flex-wrap items-center gap-2"
            >
              <div className="text-[10px] text-gray-500 shrink-0 w-full sm:w-auto">
                {l.date || "—"}
              </div>
              <div className="font-bold text-white text-xs flex-grow min-w-0 truncate">
                {l.name || "—"}
              </div>
              <div className="text-emerald-400 text-xs shrink-0">
                {l.phone || "—"}
              </div>
              <div className="text-gold-300 text-xs shrink-0 truncate max-w-[200px]">
                {l.product || "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Refresh button */}
      <button
        onClick={fetchLeads}
        className="mt-3 text-[10px] uppercase tracking-wider text-gold-400 hover:text-gold-300 flex items-center gap-1 mx-auto"
      >
        <RotateCcw size={11} /> Atualizar lista
      </button>
    </div>
  );
}

// ============================================================================
// KITS TAB — promotional bundles (2-3 perfumes sold together at special price)
// ============================================================================

function KitsTab() {
  const products = useStore((s) => s.products);
  const kits = useKitStore((s) => s.kits);
  const addKit = useKitStore((s) => s.addKit);
  const toggleKit = useKitStore((s) => s.toggleKit);
  const deleteKit = useKitStore((s) => s.deleteKit);
  const syncKitsFromD1 = useKitStore((s) => s.syncKitsFromD1);

  const [kitForm, setKitForm] = useState<{
    name: string;
    description: string;
    productIds: string[];
    price: string;
    image: string;
  }>({
    name: "",
    description: "",
    productIds: [],
    price: "",
    image: "",
  });

  // D1 SYNC — fetch kits on mount
  useEffect(() => {
    void syncKitsFromD1().catch((err) =>
      console.warn("[D1 sync] kits mount failed:", err)
    );
  }, [syncKitsFromD1]);

  const inputCls =
    "w-full bg-obsidian-900 border border-gold-500/30 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-gold-400";
  const labelCls = "block text-[10px] text-gold-300 mb-1 uppercase tracking-wider";

  // Helper — soma de preços individuais dos produtos selecionados
  const selectedProducts = products.filter((p) =>
    kitForm.productIds.includes(p.id)
  );
  const individualSum = selectedProducts.reduce(
    (acc, p) => acc + (p.price || 0),
    0
  );
  const kitPrice = parseFloat(kitForm.price) || 0;
  const savings = Math.max(0, individualSum - kitPrice);
  const autoBadge =
    savings > 0
      ? `Economize ${formatBRL(savings)}`
      : kitForm.name
      ? "Kit Especial"
      : "";

  const toggleProduct = (id: string) => {
    setKitForm((prev) => {
      const has = prev.productIds.includes(id);
      if (has) {
        return { ...prev, productIds: prev.productIds.filter((x) => x !== id) };
      }
      if (prev.productIds.length >= 3) {
        toast.warning("Máximo de 3 perfumes por kit.");
        return prev;
      }
      const newIds = [...prev.productIds, id];
      // Auto-fill image from first product if not custom-set
      const firstProduct = products.find((p) => p.id === newIds[0]);
      return {
        ...prev,
        productIds: newIds,
        image: prev.image || firstProduct?.image || "",
      };
    });
  };

  const handleCreate = () => {
    if (!kitForm.name.trim()) {
      toast.error("Informe um nome para o kit.");
      return;
    }
    if (kitForm.productIds.length < 2) {
      toast.error("Selecione ao menos 2 perfumes para o kit.");
      return;
    }
    if (kitForm.productIds.length > 3) {
      toast.error("Máximo de 3 perfumes por kit.");
      return;
    }
    if (!kitPrice || kitPrice <= 0) {
      toast.error("Informe um preço válido para o kit.");
      return;
    }
    if (savings <= 0) {
      toast.warning(
        "Preço do kit é maior ou igual à soma individual — sem economia para o cliente."
      );
    }
    const firstProduct = products.find((p) => p.id === kitForm.productIds[0]);
    addKit({
      name: kitForm.name.trim(),
      description: kitForm.description.trim(),
      productIds: kitForm.productIds,
      price: kitPrice,
      image: kitForm.image || firstProduct?.image || "",
      badge: autoBadge,
    });
    toast.success(`Kit "${kitForm.name.trim()}" criado!`);
    setKitForm({
      name: "",
      description: "",
      productIds: [],
      price: "",
      image: "",
    });
  };

  return (
    <div className="space-y-6">
      {/* CREATE KIT FORM */}
      <div className="glass-panel p-6 rounded-2xl max-w-2xl mx-auto">
        <h3 className="font-serif-luxury text-xl font-bold text-white mb-1 flex items-center gap-2">
          <Gift className="text-gold-400" size={18} /> Criar Kit Promocional
        </h3>
        <p className="text-[11px] text-gray-400 mb-4">
          Combine 2-3 perfumes por um preço especial. Aparece como card destacado
          no catálogo.
        </p>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Nome do Kit</label>
            <input
              type="text"
              value={kitForm.name}
              onChange={(e) => setKitForm({ ...kitForm, name: e.target.value })}
              placeholder="Ex: Kit Noite Sofisticada"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Descrição</label>
            <textarea
              value={kitForm.description}
              onChange={(e) =>
                setKitForm({ ...kitForm, description: e.target.value })
              }
              placeholder="Ex: Combinação perfeita para a noite"
              rows={2}
              className={inputCls + " resize-none"}
            />
          </div>

          {/* MULTI-SELECT — produtos (checkboxes) */}
          <div>
            <label className={labelCls}>
              Perfumes ({kitForm.productIds.length}/3 selecionados)
            </label>
            <div className="max-h-48 overflow-y-auto bg-obsidian-900/60 border border-gold-500/20 rounded-xl p-2 space-y-1">
              {products.length === 0 ? (
                <p className="text-[10px] text-gray-500 text-center py-4">
                  Nenhum produto cadastrado.
                </p>
              ) : (
                products.map((p) => {
                  const checked = kitForm.productIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-all ${
                        checked
                          ? "bg-gold-500/15 border border-gold-500/40"
                          : "hover:bg-obsidian-800/60 border border-transparent"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProduct(p.id)}
                        className="w-3.5 h-3.5 accent-gold-500 shrink-0"
                      />
                      <img
                        src={p.image}
                        alt={p.name}
                        className="w-7 h-7 rounded object-cover shrink-0 bg-obsidian-950"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-grow">
                        <p className="text-[11px] text-white font-bold truncate">
                          {p.name}
                        </p>
                        <p className="text-[9px] text-gray-500">
                          {p.code} • {formatBRL(p.price)}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-[9px] text-gray-500 mt-1">
              Selecione de 2 a 3 perfumes.
            </p>
          </div>

          {/* PREÇO + SOMA INDIVIDUAL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Preço do Kit (R$)</label>
              <input
                type="number"
                step="0.01"
                value={kitForm.price}
                onChange={(e) =>
                  setKitForm({ ...kitForm, price: e.target.value })
                }
                placeholder="0.00"
                className={inputCls + " text-gold-400 font-bold"}
              />
            </div>
            <div>
              <label className={labelCls}>Soma Individual</label>
              <div className="bg-obsidian-900/60 border border-gold-500/20 rounded-xl py-2 px-3 h-[34px] flex items-center">
                <span className="text-xs text-gray-400 line-through">
                  {formatBRL(individualSum)}
                </span>
              </div>
            </div>
          </div>

          {/* BADGE AUTO-CALCULATED */}
          <div>
            <label className={labelCls}>Badge (auto-calculada)</label>
            <div className="bg-gold-500/10 border border-gold-500/30 rounded-xl py-1.5 px-3 h-[30px] flex items-center">
              <span className="text-xs text-gold-300 font-bold uppercase tracking-wider">
                {autoBadge || "—"}
              </span>
            </div>
          </div>

          {/* IMAGE URL opcional */}
          <div>
            <label className={labelCls}>
              Imagem do Kit (opcional — padrão: 1º produto)
            </label>
            <input
              type="text"
              value={kitForm.image}
              onChange={(e) =>
                setKitForm({ ...kitForm, image: e.target.value })
              }
              placeholder="https://... (deixe vazio para usar a imagem do 1º perfume)"
              className={inputCls}
            />
          </div>

          <button
            onClick={handleCreate}
            className="w-full btn-gold py-3 rounded-xl text-xs uppercase font-bold flex items-center justify-center gap-2"
          >
            <Plus size={14} /> Criar Kit
          </button>
        </div>
      </div>

      {/* LISTA DE KITS EXISTENTES */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-serif-luxury text-lg font-bold text-white flex items-center gap-2">
            <Package className="text-gold-400" size={16} />
            Kits Cadastrados ({kits.length})
          </h4>
          <p className="text-[10px] text-gray-500">
            Ativos: {kits.filter((k) => k.active).length} • Inativos:{" "}
            {kits.filter((k) => !k.active).length}
          </p>
        </div>
        {kits.length === 0 ? (
          <div className="text-center py-12 glass-panel rounded-2xl">
            <Gift className="mx-auto mb-2 text-gold-500/30" size={36} />
            <p className="text-xs text-gray-500">Nenhum kit cadastrado ainda.</p>
            <p className="text-[10px] text-gray-600 mt-1">
              Crie acima o primeiro kit promocional.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {kits.map((k) => {
              const kitProducts = products.filter((p) =>
                k.productIds.includes(p.id)
              );
              const kitIndividualSum = kitProducts.reduce(
                (acc, p) => acc + (p.price || 0),
                0
              );
              return (
                <div
                  key={k.id}
                  className={`glass-panel p-4 rounded-xl border transition-all ${
                    !k.active
                      ? "border-gray-500/20 opacity-60"
                      : "border-gold-500/30 hover:border-gold-400/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-grow">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-gold-300 uppercase tracking-wider truncate">
                          {k.name}
                        </span>
                        {k.badge && (
                          <span className="text-[9px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full px-1.5 py-0.5 uppercase tracking-wider">
                            {k.badge}
                          </span>
                        )}
                        {!k.active && (
                          <span className="text-[9px] bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-full px-1.5 py-0.5 uppercase tracking-wider">
                            Inativo
                          </span>
                        )}
                      </div>
                      {k.description && (
                        <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">
                          {k.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          toggleKit(k.id);
                          toast.info(
                            `Kit ${k.name} ${k.active ? "desativado" : "ativado"}.`
                          );
                        }}
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
                          k.active
                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                            : "bg-gray-500/10 border-gray-500/30 text-gray-400 hover:bg-gray-500/20"
                        }`}
                        title={k.active ? "Desativar" : "Ativar"}
                        aria-label={k.active ? "Desativar kit" : "Ativar kit"}
                      >
                        <Power size={12} />
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Excluir kit "${k.name}"? Esta ação não pode ser desfeita.`
                            )
                          ) {
                            deleteKit(k.id);
                            toast.success(`Kit "${k.name}" excluído.`);
                          }
                        }}
                        className="w-7 h-7 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/15 transition-all flex items-center justify-center"
                        title="Excluir"
                        aria-label="Excluir kit"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* THUMBNAILS DOS PRODUTOS */}
                  <div className="flex items-center gap-2 mb-2">
                    {kitProducts.length === 0 ? (
                      <p className="text-[10px] text-gray-500 italic">
                        Produtos não encontrados.
                      </p>
                    ) : (
                      kitProducts.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-1.5 bg-obsidian-900/60 rounded-lg p-1 pr-2 border border-gold-500/10"
                        >
                          <img
                            src={p.image}
                            alt={p.name}
                            className="w-7 h-7 rounded object-cover shrink-0 bg-obsidian-950"
                            loading="lazy"
                          />
                          <span className="text-[10px] text-white truncate max-w-[80px]">
                            {p.name}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* PREÇOS */}
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <strong className="text-gold-300">Kit:</strong>{" "}
                      <span className="text-gold-400 font-bold">
                        {formatBRL(k.price)}
                      </span>
                    </span>
                    {kitIndividualSum > 0 && (
                      <span className="text-gray-500 line-through">
                        {formatBRL(kitIndividualSum)}
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
  );
}
