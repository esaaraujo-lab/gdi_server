"use client";

import { useState } from "react";

interface SkeletonImageProps {
  src: string;
  alt: string;
  className?: string;
  /** Optional fallback when src fails to load */
  fallbackSrc?: string;
  loading?: "lazy" | "eager";
}

/**
 * Imagem com skeleton loading (shimmer dourado) enquanto carrega.
 * Substitui o pattern de `<img onError={...}>` por uma versão polida:
 *  1. Mostra skeleton shimmer dourado até a imagem carregar
 *  2. Fade-in suave quando a imagem termina de baixar
 *  3. Fallback automático para `fallbackSrc` em caso de erro
 *
 * Uso:
 * <SkeletonImage src={p.image} alt={p.name} className="w-full h-44 object-cover" />
 *
 * Implementação: usa `key={src}` para forçar re-mount quando src muda,
 * evitando setState-in-effect warnings.
 */
export default function SkeletonImage({
  src,
  alt,
  className = "",
  fallbackSrc = "https://placehold.co/400x500/12141d/d4af37?text=Mimi+Mimos+25ml",
  loading = "lazy",
}: SkeletonImageProps) {
  return (
    <SkeletonImageInner
      key={src}
      src={src}
      alt={alt}
      className={className}
      fallbackSrc={fallbackSrc}
      loading={loading}
    />
  );
}

function SkeletonImageInner({
  src,
  alt,
  className = "",
  fallbackSrc,
  loading = "lazy",
}: Omit<SkeletonImageProps, "fallbackSrc"> & {
  fallbackSrc: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [errored, setErrored] = useState(false);

  const handleError = () => {
    if (!errored) {
      setErrored(true);
      setCurrentSrc(fallbackSrc);
    }
  };

  const handleLoad = () => {
    setLoaded(true);
  };

  return (
    <div
      className={`relative overflow-hidden bg-obsidian-800 ${className}`}
      style={{ minHeight: loaded ? "auto" : "100px" }}
    >
      {/* Skeleton shimmer — visível até a imagem carregar */}
      {!loaded && (
        <div
          className="absolute inset-0 skeleton-shimmer pointer-events-none"
          aria-hidden="true"
        />
      )}
      <img
        src={currentSrc}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        loading={loading}
        className={`w-full h-full object-cover transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        } ${className}`}
      />
      <style jsx>{`
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        .skeleton-shimmer {
          background: linear-gradient(
            90deg,
            rgba(40, 35, 25, 0.6) 0%,
            rgba(80, 65, 35, 0.4) 50%,
            rgba(40, 35, 25, 0.6) 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
