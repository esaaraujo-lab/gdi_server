"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore, useUI } from "@/lib/stores-combined";
import {
  Wand2,
  X,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Venus,
  Mars,
  Heart,
  Check,
  ChevronLeft,
  ShoppingBag,
} from "lucide-react";
import type { Perfume, ProductGender } from "@/lib/perfumes";

type QuizGender = "MULHER" | "HOMEM" | null;

interface QuestionOption {
  label: string;
  tags: string[];
  emoji: string;
  hint?: string;
}

interface Question {
  id: number;
  text: string;
  helper?: string;
  options: QuestionOption[];
}

// ───────────────────────────────────────────────────────────────
//  Perguntas BASE (mesmas para ambos os sexos)
// ───────────────────────────────────────────────────────────────
const Q_AROMA: Question = {
  id: 1,
  text: "Qual desses aromas te atrai mais?",
  helper: "Pense no cheiro que te faz fechar os olhos e sorrir.",
  options: [
    {
      label: "Doce & quente",
      tags: ["Baunilha", "Canela", "Gourmand", "Caramelo"],
      emoji: "🍯",
      hint: "Canela, baunilha, caramelo",
    },
    {
      label: "Floral & delicado",
      tags: ["Rosa", "Jasmim", "Floral", "Peônia"],
      emoji: "🌸",
      hint: "Rosa, jasmim, flor de laranjeira",
    },
    {
      label: "Amadeirado & intenso",
      tags: ["Oud", "Âmbar", "Amadeirado", "Sândalo"],
      emoji: "🪵",
      hint: "Oud, âmbar, sândalo",
    },
    {
      label: "Cítrico & fresco",
      tags: ["Cítrico", "Fresco", "Bergamota", "Limão"],
      emoji: "🍋",
      hint: "Limão, bergamota, notas marinhas",
    },
  ],
};

const Q_OCCASION_FEMININO: Question = {
  id: 2,
  text: "Para qual ocasião você mais usa perfume?",
  options: [
    {
      label: "Trabalho / dia a dia",
      tags: ["Fresco", "Cítrico", "Floral"],
      emoji: "💼",
      hint: "Sutil e elegante",
    },
    {
      label: "Festas & eventos",
      tags: ["Gourmand", "Âmbar", "Frutas Vermelhas"],
      emoji: "🎉",
      hint: "Marcante e memorável",
    },
    {
      label: "Encontros românticos",
      tags: ["Rosa", "Baunilha", "Sensual"],
      emoji: "💕",
      hint: "Sensual e provocante",
    },
    {
      label: "Aconchego em casa",
      tags: ["Baunilha", "Lavanda", "Almíscar"],
      emoji: "🛋️",
      hint: "Doce e acolhedor",
    },
  ],
};

const Q_OCCASION_MASCULINO: Question = {
  id: 2,
  text: "Para qual ocasião você mais usa perfume?",
  options: [
    {
      label: "Trabalho / dia a dia",
      tags: ["Fresco", "Cítrico", "Amadeirado"],
      emoji: "💼",
      hint: "Sutil e profissional",
    },
    {
      label: "Baladas & eventos",
      tags: ["Couro", "Amadeirado", "Tabaco"],
      emoji: "🥃",
      hint: "Marcante e presencial",
    },
    {
      label: "Encontros românticos",
      tags: ["Âmbar", "Baunilha", "Especiado"],
      emoji: "💕",
      hint: "Sensual e magnético",
    },
    {
      label: "Aconchego / lazer",
      tags: ["Lavanda", "Almíscar", "Madeira"],
      emoji: "🛋️",
      hint: "Tranquilo e confortável",
    },
  ],
};

const Q_SEASON: Question = {
  id: 3,
  text: "Qual estação prefere para usar perfume?",
  options: [
    {
      label: "Verão",
      tags: ["Cítrico", "Coco", "Fresco", "Tropical"],
      emoji: "☀️",
      hint: "Fresco e leve",
    },
    {
      label: "Inverno",
      tags: ["Oud", "Baunilha", "Canela", "Couro"],
      emoji: "❄️",
      hint: "Quente e intenso",
    },
    {
      label: "Primavera",
      tags: ["Rosa", "Jasmim", "Floral", "Frutal"],
      emoji: "🌷",
      hint: "Floral e alegre",
    },
    {
      label: "Outono",
      tags: ["Âmbar", "Patchouli", "Sândalo", "Tabaco"],
      emoji: "🍂",
      hint: "Amadeirado e aconchegante",
    },
  ],
};

const Q_STYLE_FEMININO: Question = {
  id: 4,
  text: "Qual estilo combina com você?",
  options: [
    {
      label: "Feminina & elegante",
      tags: ["Rosa", "Floral", "Jasmim"],
      emoji: "👗",
      hint: "Clássico e sofisticado",
    },
    {
      label: "Sensual & marcante",
      tags: ["Baunilha", "Âmbar", "Sensual"],
      emoji: "🔥",
      hint: "Provocante e ousado",
    },
    {
      label: "Doce & acolhedor",
      tags: ["Baunilha", "Caramelo", "Gourmand"],
      emoji: "🍮",
      hint: "Adoçante e quente",
    },
    {
      label: "Fresca & leve",
      tags: ["Cítrico", "Fresco", "Frutal"],
      emoji: "🌿",
      hint: "Leve e radiante",
    },
  ],
};

const Q_STYLE_MASCULINO: Question = {
  id: 4,
  text: "Qual estilo combina com você?",
  options: [
    {
      label: "Masculino & ousado",
      tags: ["Couro", "Amadeirado", "Tabaco"],
      emoji: "🎩",
      hint: "Forte e presencial",
    },
    {
      label: "Elegante clássico",
      tags: ["Amadeirado", "Âmbar", "Lavanda"],
      emoji: "🤵",
      hint: "Sofisticado e atemporal",
    },
    {
      label: "Amadeirado intenso",
      tags: ["Oud", "Âmbar", "Incenso"],
      emoji: "🌲",
      hint: "Nicho e exótico",
    },
    {
      label: "Cítrico fresco",
      tags: ["Cítrico", "Fresco", "Marinho"],
      emoji: "🌊",
      hint: "Esportivo e energético",
    },
  ],
};

function buildQuestions(gender: QuizGender): Question[] {
  if (gender === "MULHER") {
    return [Q_AROMA, Q_OCCASION_FEMININO, Q_SEASON, Q_STYLE_FEMININO];
  }
  if (gender === "HOMEM") {
    return [Q_AROMA, Q_OCCASION_MASCULINO, Q_SEASON, Q_STYLE_MASCULINO];
  }
  return [Q_AROMA, Q_OCCASION_FEMININO, Q_SEASON, Q_STYLE_FEMININO];
}

/** Filtra produtos pelo gênero selecionado pelo usuário. */
function filterByGender(products: Perfume[], gender: QuizGender): Perfume[] {
  if (!gender) return products;
  if (gender === "MULHER") {
    // Mulher: feminino, unissex e árabe (que são em sua maioria nicho unissex/feminino)
    return products.filter(
      (p) =>
        p.gender === "FEMININO" ||
        p.gender === "UNISSEX" ||
        p.gender === "ARABE"
    );
  }
  // Homem: masculino, unissex e árabe
  return products.filter(
    (p) =>
      p.gender === "MASCULINO" ||
      p.gender === "UNISSEX" ||
      p.gender === "ARABE"
  );
}

const GENDER_LS_KEY = "mimi-quiz-gender";
const RESULT_LS_KEY = "mimi-quiz-last-result";

export default function OlfactoryQuiz() {
  const products = useStore((s) => s.products);
  const openQuickView = useUI((s) => s.openQuickView);
  const setActiveCategory = useUI((s) => s.setActiveCategory);
  const resetFilters = useUI((s) => s.resetFilters);

  const [open, setOpen] = useState(false);
  const [gender, setGender] = useState<QuizGender>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<string[][]>([]);
  const [results, setResults] = useState<Perfume[] | null>(null);

  // Carrega preferência de gênero do localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GENDER_LS_KEY);
      if (saved === "MULHER" || saved === "HOMEM") {
        // apenas pré-preenche — não pula a tela automaticamente
        // (usuário ainda pode trocar)
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Quando o gênero muda, atualiza perguntas
  const questions = useMemo(() => buildQuestions(gender), [gender]);

  // Produtos filtrados pelo gênero
  const genderFiltered = useMemo(
    () => filterByGender(products, gender),
    [products, gender]
  );

  const totalSteps = gender ? questions.length : 0; // 4 perguntas
  // Step atual: -1 = seleção de gênero, 0..3 = perguntas, 4 = resultados
  const stepIndex = gender ? current : -1;
  const isGenderStep = !gender && !results;
  const isResultsStep = !!results;

  const handleGenderChoice = (g: QuizGender) => {
    setGender(g);
    try {
      if (g) localStorage.setItem(GENDER_LS_KEY, g);
    } catch {
      /* ignore */
    }
    setCurrent(0);
    setAnswers([]);
    setResults(null);
  };

  const selectAnswer = (tags: string[]) => {
    const newAnswers = [...answers, tags];
    setAnswers(newAnswers);
    if (current < questions.length - 1) {
      setCurrent(current + 1);
    } else {
      // Calcula resultado — APENAS produtos do gênero selecionado
      const allTags = newAnswers.flat();
      const scored = genderFiltered
        .map((p) => {
          const productTags = (p.tags || []).map((t) => t.toLowerCase());
          const noteTags = `${p.notesTopo} ${p.notesCoracao} ${p.notesFundo}`.toLowerCase();
          const familyTags = (p.family || "").toLowerCase();
          const descriptionTags = (p.description || "").toLowerCase();
          let score = 0;
          allTags.forEach((tag) => {
            const tagLower = tag.toLowerCase();
            if (productTags.some((t) => t.includes(tagLower) || tagLower.includes(t))) score += 4;
            if (noteTags.includes(tagLower)) score += 2;
            if (familyTags.includes(tagLower)) score += 1;
            if (descriptionTags.includes(tagLower)) score += 1;
          });
          // Bônus por popularidade
          score += (p.rating || 0) * 0.2;
          return { product: p, score };
        })
        .filter((s) => s.score > 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      // Se não houver match suficiente, pega os top 3 por rating do gênero
      const finalResults =
        scored.length >= 1
          ? scored.map((s) => s.product)
          : [...genderFiltered]
              .sort((a, b) => (b.rating || 0) - (a.rating || 0))
              .slice(0, 3);

      setResults(finalResults);
      try {
        localStorage.setItem(RESULT_LS_KEY, JSON.stringify(finalResults.map((p) => p.id)));
      } catch {
        /* ignore */
      }
    }
  };

  const reset = () => {
    setGender(null);
    setCurrent(0);
    setAnswers([]);
    setResults(null);
  };

  const resetKeepGender = () => {
    setCurrent(0);
    setAnswers([]);
    setResults(null);
  };

  const goToCatalogByGender = () => {
    const cat = gender === "MULHER" ? "FEMININO" : "MASCULINO";
    resetFilters();
    setActiveCategory(cat);
    setOpen(false);
    // Scroll suave até o catálogo
    setTimeout(() => {
      document
        .getElementById("catalogSection")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const progressPct = (() => {
    if (!gender) return 0;
    if (results) return 100;
    return ((current + 1) / questions.length) * 100;
  })();

  // Texto de contagem de produtos disponíveis por gênero
  const genderCountText = (() => {
    if (!gender) return null;
    const count = genderFiltered.length;
    const label = gender === "MULHER" ? "femininas" : "masculinos";
    return `${count} fragrâncias ${label} disponíveis`;
  })();

  // Cor de acento por gênero (sutilmente diferentes)
  const accentClass =
    gender === "MULHER"
      ? "from-rose-400/60 via-pink-500/30 to-gold-500/40"
      : gender === "HOMEM"
      ? "from-sky-400/40 via-emerald-400/30 to-gold-500/40"
      : "from-gold-500 to-gold-300";

  return (
    <>
      {/* Botão para abrir o quiz */}
      <section className="py-10 px-4 max-w-7xl mx-auto">
        <button
          onClick={() => {
            reset();
            setOpen(true);
          }}
          className="w-full relative overflow-hidden glass-panel-gold rounded-3xl p-6 sm:p-8 border border-gold-500/40 hover:border-gold-400/60 transition-all group flex items-center justify-between gap-4"
        >
          {/* Aura animada */}
          <div className="absolute inset-0 opacity-40 pointer-events-none">
            <div className="absolute -top-20 -left-20 w-60 h-60 bg-gold-500/20 rounded-full blur-3xl animate-pulse" />
            <div
              className="absolute -bottom-20 -right-20 w-60 h-60 bg-gold-400/15 rounded-full blur-3xl animate-pulse"
              style={{ animationDelay: "1.5s" }}
            />
          </div>

          <div className="flex items-center gap-4 sm:gap-6 relative z-10">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-gold-500/30 to-gold-600/10 border border-gold-500/40 flex items-center justify-center text-gold-300 group-hover:scale-110 group-hover:rotate-3 transition-all shrink-0 shadow-lg shadow-gold-500/20">
              <Wand2 size={32} />
            </div>
            <div className="text-left">
              <span className="text-[10px] uppercase tracking-[0.25em] text-gold-300/70 font-medium">
                Quiz Olfativo Personalizado
              </span>
              <h3 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white mt-1">
                Encontre Seu Perfume Ideal
              </h3>
              <p className="text-xs sm:text-sm text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Venus size={11} className="text-rose-300/70" />
                  Mulher
                </span>
                <span className="text-gold-500/40">ou</span>
                <span className="inline-flex items-center gap-1">
                  <Mars size={11} className="text-sky-300/70" />
                  Homem
                </span>
                <span className="text-gold-500/40">·</span>
                <span>4 perguntas rápidas</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 relative z-10">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gold-300/80 border border-gold-500/30 rounded-full px-3 py-1 bg-gold-500/5">
              <Sparkles size={11} /> Recomendação IA
            </span>
            <div className="w-10 h-10 rounded-full bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-gold-300 group-hover:bg-gold-500 group-hover:text-obsidian-950 transition-all">
              <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </button>
      </section>

      {/* Modal do Quiz */}
      {open && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className={`glass-panel max-w-lg w-full rounded-3xl p-6 sm:p-7 relative border border-gold-500/40 shadow-2xl max-h-[92vh] overflow-y-auto`}
          >
            {/* Topbar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-lg bg-gradient-to-br ${accentClass} border border-gold-500/40 flex items-center justify-center text-white`}
                >
                  <Wand2 size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-gold-300/80 font-medium leading-tight">
                    Quiz Olfativo
                  </span>
                  {gender && !results && (
                    <span className="text-[10px] text-gray-400 leading-tight">
                      Pergunta {current + 1} de {questions.length}
                    </span>
                  )}
                  {gender && results && (
                    <span className="text-[10px] text-gold-300/80 leading-tight">
                      Resultado final
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {gender && !results && (
                  <button
                    onClick={reset}
                    className="text-[10px] uppercase tracking-wider text-gray-400 hover:text-gold-300 px-2 py-1 rounded transition-colors"
                  >
                    Trocar gênero
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-obsidian-800 rounded-full mb-5 overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${accentClass} transition-all duration-500 rounded-full`}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* ───────── STEP -1: SELEÇÃO DE GÊNERO ───────── */}
            {isGenderStep && (
              <div className="animate-in fade-in zoom-in-95 duration-300">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-full bg-gold-500/15 border border-gold-500/30 flex items-center justify-center mx-auto mb-3 text-gold-300">
                    <Sparkles size={28} />
                  </div>
                  <h3 className="font-serif-luxury text-2xl font-bold text-white">
                    Vamos começar pelo essencial
                  </h3>
                  <p className="text-xs text-gray-400 mt-1.5 px-4">
                    Selecione abaixo para personalizar suas recomendações.
                    Suas escolhas vão direcionar o quiz para os perfumes
                    disponíveis no site para você.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Mulher */}
                  <button
                    onClick={() => handleGenderChoice("MULHER")}
                    className="group relative overflow-hidden text-left p-5 rounded-2xl border border-rose-400/20 hover:border-rose-400/60 bg-gradient-to-br from-rose-500/10 via-rose-400/5 to-transparent hover:from-rose-500/20 transition-all"
                  >
                    <div className="absolute -top-8 -right-8 w-24 h-24 bg-rose-400/20 rounded-full blur-2xl group-hover:bg-rose-400/30 transition-colors" />
                    <div className="relative z-10">
                      <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-rose-300 mb-3 group-hover:scale-110 transition-transform">
                        <Venus size={26} />
                      </div>
                      <h4 className="font-serif-luxury text-lg font-bold text-white">
                        Sou Mulher
                      </h4>
                      <p className="text-[11px] text-rose-200/70 mt-0.5">
                        Fragrâncias femininas, unissex e árabes
                      </p>
                      <div className="flex items-center gap-1 mt-3 text-[10px] uppercase tracking-wider text-rose-300/80">
                        <span>Começar</span>
                        <ArrowRight size={11} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </button>

                  {/* Homem */}
                  <button
                    onClick={() => handleGenderChoice("HOMEM")}
                    className="group relative overflow-hidden text-left p-5 rounded-2xl border border-sky-400/20 hover:border-sky-400/60 bg-gradient-to-br from-sky-500/10 via-emerald-400/5 to-transparent hover:from-sky-500/20 transition-all"
                  >
                    <div className="absolute -top-8 -right-8 w-24 h-24 bg-sky-400/20 rounded-full blur-2xl group-hover:bg-sky-400/30 transition-colors" />
                    <div className="relative z-10">
                      <div className="w-12 h-12 rounded-full bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 mb-3 group-hover:scale-110 transition-transform">
                        <Mars size={26} />
                      </div>
                      <h4 className="font-serif-luxury text-lg font-bold text-white">
                        Sou Homem
                      </h4>
                      <p className="text-[11px] text-sky-200/70 mt-0.5">
                        Fragrâncias masculinas, unissex e árabes
                      </p>
                      <div className="flex items-center gap-1 mt-3 text-[10px] uppercase tracking-wider text-sky-300/80">
                        <span>Começar</span>
                        <ArrowRight size={11} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </button>
                </div>

                <div className="mt-5 flex items-start gap-2 p-3 rounded-xl bg-gold-500/5 border border-gold-500/15">
                  <Sparkles size={14} className="text-gold-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    O quiz usa as respostas para buscar, entre todos os
                    produtos disponíveis no site, aqueles que combinam com
                    seu perfil e gênero.
                  </p>
                </div>
              </div>
            )}

            {/* ───────── STEP 0-3: PERGUNTAS ───────── */}
            {gender && !results && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                {/* Gender chip + count */}
                <div className="flex items-center justify-between mb-4">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                      gender === "MULHER"
                        ? "border-rose-400/30 bg-rose-500/10 text-rose-300"
                        : "border-sky-400/30 bg-sky-500/10 text-sky-300"
                    }`}
                  >
                    {gender === "MULHER" ? <Venus size={11} /> : <Mars size={11} />}
                    {gender === "MULHER" ? "Feminino" : "Masculino"}
                  </span>
                  {genderCountText && (
                    <span className="text-[10px] text-gold-300/70 font-medium">
                      {genderCountText}
                    </span>
                  )}
                </div>

                <h3 className="font-serif-luxury text-xl sm:text-2xl font-bold text-white mb-1.5">
                  {questions[current].text}
                </h3>
                {questions[current].helper && (
                  <p className="text-xs text-gray-400 mb-4 italic">
                    {questions[current].helper}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {questions[current].options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => selectAnswer(opt.tags)}
                      className={`group text-left p-3.5 rounded-xl border transition-all relative overflow-hidden ${
                        gender === "MULHER"
                          ? "bg-obsidian-800/60 border-rose-500/15 hover:border-rose-400/50 hover:bg-rose-500/5"
                          : "bg-obsidian-800/60 border-sky-500/15 hover:border-sky-400/50 hover:bg-sky-500/5"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl block shrink-0 group-hover:scale-125 transition-transform">
                          {opt.emoji}
                        </span>
                        <div className="min-w-0">
                          <span className="text-sm text-white font-medium block leading-tight">
                            {opt.label}
                          </span>
                          {opt.hint && (
                            <span className="text-[10px] text-gray-400 block mt-0.5 leading-tight">
                              {opt.hint}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Hover check */}
                      <div
                        className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${
                          gender === "MULHER"
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-sky-500/20 text-sky-300"
                        }`}
                      >
                        <Check size={11} />
                      </div>
                    </button>
                  ))}
                </div>

                {current > 0 && (
                  <button
                    onClick={() => {
                      setCurrent(current - 1);
                      setAnswers(answers.slice(0, -1));
                    }}
                    className="mt-4 text-xs text-gray-400 hover:text-white flex items-center gap-1"
                  >
                    <ChevronLeft size={12} /> Voltar pergunta
                  </button>
                )}
              </div>
            )}

            {/* ───────── RESULTADOS ───────── */}
            {gender && results && (
              <div className="animate-in fade-in zoom-in-95 duration-300">
                <div className="text-center mb-5">
                  <div
                    className={`w-16 h-16 rounded-full bg-gradient-to-br ${accentClass} border border-gold-500/40 flex items-center justify-center mx-auto mb-3 text-white shadow-lg shadow-gold-500/20`}
                  >
                    <Sparkles size={30} />
                  </div>
                  <h3 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white">
                    Seus Perfumes Ideais!
                  </h3>
                  <p className="text-xs text-gray-400 mt-1.5 px-2">
                    Para <strong className="text-gold-300">{gender === "MULHER" ? "ela" : "ele"}</strong>,
                    selecionamos {results.length} fragrâncias perfeitas
                    disponíveis no site
                  </p>
                </div>

                <div className="space-y-2.5">
                  {results.map((p, i) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        openQuickView(p);
                        setOpen(false);
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-obsidian-800/60 border border-gold-500/20 hover:border-gold-400/50 hover:bg-gold-500/5 transition-all text-left group"
                    >
                      <div
                        className={`relative w-8 h-8 rounded-full bg-gradient-to-br ${accentClass} border border-gold-500/40 flex items-center justify-center text-white font-bold text-sm shrink-0`}
                      >
                        {i + 1}
                        {i === 0 && (
                          <span className="absolute -top-1 -right-1 text-[8px] bg-gold-500 text-obsidian-950 px-1 py-0.5 rounded-full font-bold uppercase tracking-wider">
                            Top
                          </span>
                        )}
                      </div>
                      <img
                        src={p.image}
                        alt={p.name}
                        className="w-14 h-14 object-cover rounded-lg bg-obsidian-950 shrink-0 border border-white/5"
                        loading="lazy"
                      />
                      <div className="flex-grow min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">
                          {p.name}
                        </h4>
                        <p className="text-[10px] text-gold-300/80 truncate">
                          {p.inspiration}
                        </p>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {(p.tags || []).slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="text-[9px] bg-gold-400/10 text-gold-300 border border-gold-400/20 rounded px-1.5 py-0.5"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-0.5 text-gold-300 text-[10px] mb-1 justify-end">
                          <Sparkles size={9} />
                          <span className="font-medium">
                            {p.rating?.toFixed(1) || "4.8"}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400">
                          {p.gender === "FEMININO"
                            ? "Feminino"
                            : p.gender === "MASCULINO"
                            ? "Masculino"
                            : p.gender === "UNISSEX"
                            ? "Unissex"
                            : "Árabe"}
                        </p>
                      </div>
                      <ArrowRight
                        size={16}
                        className="text-gold-400 group-hover:translate-x-1 transition-transform shrink-0"
                      />
                    </button>
                  ))}
                </div>

                {/* Ações */}
                <div className="mt-5 space-y-2">
                  <button
                    onClick={goToCatalogByGender}
                    className={`w-full py-3 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 font-bold border-2 transition-all ${
                      gender === "MULHER"
                        ? "border-rose-400/60 bg-rose-500/15 hover:bg-rose-500/25 text-rose-100 hover:text-white shadow-md shadow-rose-500/10"
                        : "border-sky-400/60 bg-sky-500/15 hover:bg-sky-500/25 text-sky-100 hover:text-white shadow-md shadow-sky-500/10"
                    }`}
                  >
                    <ShoppingBag size={14} />
                    Ver todos os perfumes {gender === "MULHER" ? "femininos" : "masculinos"}
                  </button>
                  <button
                    onClick={resetKeepGender}
                    className="w-full btn-gold py-2.5 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2"
                  >
                    <RotateCcw size={13} /> Refazer Quiz
                  </button>
                  <button
                    onClick={reset}
                    className="w-full text-[10px] text-gray-500 hover:text-gray-300 py-1 uppercase tracking-wider"
                  >
                    Trocar gênero
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
