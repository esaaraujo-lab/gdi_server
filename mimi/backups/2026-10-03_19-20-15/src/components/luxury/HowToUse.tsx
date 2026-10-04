"use client";

import {
  Sparkles,
  Droplets,
  Wind,
  Sun,
  Moon,
  Layers,
  FlaskConical,
  Flower2,
  Crown,
} from "lucide-react";

const steps = [
  {
    icon: Droplets,
    title: "1. Pulso & Pescoço",
    desc: "Aplique a 20cm da pele nos pontos de pulsação: pulsos, atrás das orelhas e base do pescoço.",
  },
  {
    icon: Wind,
    title: "2. Não Esfregue",
    desc: "Deixe secar naturalmente. Esfregar aquece e quebra as notas de topo, reduzindo a fixação.",
  },
  {
    icon: Sun,
    title: "3. Hidrate Antes",
    desc: "Pele hidratada segura a fragrância por mais horas. Use loção neutra antes do perfume.",
  },
  {
    icon: Moon,
    title: "4. Reaplique à Noite",
    desc: "Frasco 25ml é perfeito para levar na bolsa. Reaplique 1-2x ao dia conforme desejar.",
  },
];

const layeringSteps = [
  {
    icon: Crown,
    title: "Comece pelo mais forte",
    desc: "Aplique primeiro o perfume mais intenso ou amadeirado (ex: Oud, Âmbar, Couro). Ele será a base da sua fragrância.",
    example: "Ex: Baccarat Rouge 540 ou Khamrah na pele seca",
  },
  {
    icon: Flower2,
    title: "Adicione o perfume floral",
    desc: "Por cima, aplique um perfume mais leve e floral (ex: Rosa, Jasmim). Ele vai suavizar a base forte.",
    example: "Ex: Fakhar Rose ou Yara Pink sobre o Oud",
  },
  {
    icon: FlaskConical,
    title: "Finalize com cítrico (opcional)",
    desc: "Para dar frescor, borrife um perfume cítrico por último (ex: Bergamota, Limão). Cama a combinação.",
    example: "Ex: uma borrifada de Allure Sport no final",
  },
  {
    icon: Layers,
    title: "Aguarde 5 minutos",
    desc: "Deixe as fragrâncias se fundirem na pele. O resultado é um aroma único e pessoal — sua assinatura olfativa!",
    example: "Dica: não misture mais de 3 perfumes de uma vez",
  },
];

export default function HowToUse() {
  return (
    <section
      id="howToUseSection"
      className="py-12 px-4 sm:px-8 max-w-7xl mx-auto border-t border-gold-500/10"
    >
      <div className="text-center mb-8">
        <span className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-gold-500/30 bg-gold-500/10 text-gold-300 text-xs font-medium uppercase tracking-widest mb-3">
          <Sparkles className="text-gold-400" size={14} />
          Guia de Uso
        </span>
        <h3 className="font-serif-luxury text-3xl font-bold text-white">
          Como Extrair o Máximo do Seu Frasco
        </h3>
        <p className="text-xs text-gray-400 mt-1 max-w-xl mx-auto">
          Dicas de perfumistas profissionais para fixação prolongada e projeção
          marcante.
        </p>
      </div>

      {/* Dicas básicas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        {steps.map((s, i) => (
          <div
            key={i}
            className="glass-panel p-5 rounded-2xl border border-gold-500/10 hover:border-gold-400/40 transition-all hover:-translate-y-1 group"
          >
            <div className="w-12 h-12 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center text-gold-400 mb-3 group-hover:bg-gold-500/25 transition-colors">
              <s.icon size={22} />
            </div>
            <h4 className="font-serif-luxury text-base font-bold text-white mb-1">
              {s.title}
            </h4>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              {s.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Layering — Combinação de Perfumes */}
      <div className="glass-panel-gold rounded-3xl p-6 sm:p-8 border border-gold-500/30">
        <div className="text-center mb-6">
          <span className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-gold-400/40 bg-gold-500/20 text-gold-200 text-xs font-bold uppercase tracking-widest mb-3">
            <Layers className="text-gold-300" size={14} />
            Layering — Arte de Combinar
          </span>
          <h4 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white mb-2">
            Crie Sua Assinatura Olfativa
          </h4>
          <p className="text-xs text-gray-300 max-w-2xl mx-auto leading-relaxed">
            <strong className="text-gold-300">Layering</strong> é a técnica de
            sobrepor dois ou mais perfumes para criar uma fragrância única.
            Pense como cozinhar: cada perfume é um ingrediente, e juntos eles
            formam um prato exclusivo seu.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {layeringSteps.map((s, i) => (
            <div
              key={i}
              className="bg-obsidian-900/60 rounded-2xl p-4 border border-gold-500/20 hover:border-gold-400/50 transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-lg bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-gold-400 shrink-0">
                  <s.icon size={18} />
                </div>
                <span className="text-[10px] uppercase tracking-widest text-gold-400/80 font-bold">
                  Passo {i + 1}
                </span>
              </div>
              <h5 className="font-serif-luxury text-sm font-bold text-white mb-1.5">
                {s.title}
              </h5>
              <p className="text-[11px] text-gray-300 leading-relaxed mb-2">
                {s.desc}
              </p>
              <p className="text-[10px] text-gold-300/80 italic border-t border-gold-500/10 pt-1.5">
                {s.example}
              </p>
            </div>
          ))}
        </div>

        {/* Combinações sugeridas */}
        <div className="mt-6 pt-6 border-t border-gold-500/20">
          <h5 className="font-serif-luxury text-lg font-bold text-gold-300 mb-3 text-center">
            ✨ Combinações Sugeridas da Mimi Mimos
          </h5>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-obsidian-900/60 rounded-xl p-3 border border-gold-500/15">
              <p className="text-xs font-bold text-white mb-1">
                🌙 Noite Sofisticada
              </p>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                <span className="text-gold-300">Baccarat Rouge 540</span> +
                Fakhar Rose — âmbar quente com floral sedutor
              </p>
            </div>
            <div className="bg-obsidian-900/60 rounded-xl p-3 border border-gold-500/15">
              <p className="text-xs font-bold text-white mb-1">
                ☀️ Dia Refrescante
              </p>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                <span className="text-gold-300">Asad Zanzibar</span> + Yara Tous
                — coco marinho com manga tropical
              </p>
            </div>
            <div className="bg-obsidian-900/60 rounded-xl p-3 border border-gold-500/15">
              <p className="text-xs font-bold text-white mb-1">
                💎 Eventos de Luxo
              </p>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                <span className="text-gold-300">Khamrah</span> + Chants Tenderina
                — gourmand especiado com floral radiante
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
