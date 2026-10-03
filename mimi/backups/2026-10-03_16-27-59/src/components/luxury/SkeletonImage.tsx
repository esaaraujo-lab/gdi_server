"use client";

import { useState } from "react";

interface SkeletonImageProps {
  src: string;
  alt: string;
  className?: string;
  /** Optional fallback when src fails to load */
  fallbackSrc?: string;
  loading?: "lazy" | "eager";
  /**
   * How the image should fit its container.
   * - "cover" (default): fills container, may crop edges (good for landscapes/photos)
   * - "contain": whole image visible, letterboxed (good for product bottles)
   */
  fit?: "cover" | "contain";
}

/**
 * Imagem com skeleton loading (shimmer dourado) enquanto carrega.
 * Substitui o pattern de `<img onError={...}>` por uma versão polida:
 *  1. Mostra skeleton shimmer dourado até a imagem carregar
 *  2. Fade-in suave quando a imagem termina de baixar
 *  3. Fallback automático para `fallbackSrc` em caso de erro
 *
 * Uso:
 * <SkeletonImage src={p.image} alt={p.name} className="w-full h-44" fit="contain" />
 *
 * Implementação: usa `key={src}` para forçar re-mount quando src muda,
 * evitando setState-in-effect warnings.
 */
export default function SkeletonImage({
  src,
  alt,
  className = "",
  // Generate a placeholder with the perfume name (from alt text) on dark bg with gold text
  fallbackSrc,
  loading = "lazy",
  fit = "cover",
}: SkeletonImageProps) {
  // If no custom fallback, generate one with the perfume name
  const computedFallback =
    fallbackSrc ||
    `https://placehold.co/400x500/12141d/d4af37?text=${encodeURIComponent(
      (alt || "Mimi Mimos").slice(0, 30)
    )}`;
  return (
    <SkeletonImageInner
      key={src}
      src={src}
      alt={alt}
      className={className}
      fallbackSrc={computedFallback}
      loading={loading}
      fit={fit}
    />
  );
}

function SkeletonImageInner({
  src,
  alt,
  className = "",
  fallbackSrc,
  loading = "lazy",
  fit = "cover",
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

  const objectClass = fit === "contain" ? "object-contain" : "object-cover";

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
        ref={(img) => {
          // Fix: cached images fire onLoad before React attaches the handler.
          // Check if image is already complete (cached) and set loaded state.
          if (img && img.complete && img.naturalWidth > 0 && !loaded) {
            setLoaded(true);
          }
        }}
        className={`w-full h-full ${objectClass} transition-opacity duration-500 ${
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
