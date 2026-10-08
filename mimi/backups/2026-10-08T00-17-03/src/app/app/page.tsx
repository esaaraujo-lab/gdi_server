"use client";

import { useEffect } from "react";
import { AnnouncementBar } from "@/components/luxury/Header";
import Header from "@/components/luxury/Header";
import Hero from "@/components/luxury/Hero";
import PinnedProductBanner from "@/components/luxury/PinnedProductBanner";
import PromoKits from "@/components/luxury/PromoKits";
import FeaturedCarousel from "@/components/luxury/FeaturedCarousel";
import StatsBar from "@/components/luxury/StatsBar";
import ScentMatcher from "@/components/luxury/ScentMatcher";
import CatalogGrid from "@/components/luxury/CatalogGrid";
import HowToUse from "@/components/luxury/HowToUse";
import SeasonalBanner from "@/components/luxury/SeasonalBanner";
import UrgencyBanner from "@/components/luxury/UrgencyBanner";
import SubscriptionPlans from "@/components/luxury/SubscriptionPlans";
import InstagramShopping from "@/components/luxury/InstagramShopping";
import TrustBadges from "@/components/luxury/TrustBadges";
import FAQSection from "@/components/luxury/FAQSection";
import OlfactoryQuiz from "@/components/luxury/OlfactoryQuiz";
import ReferralSystem from "@/components/luxury/ReferralSystem";
import RecentlyViewed from "@/components/luxury/RecentlyViewed";
import NewsletterSection from "@/components/luxury/NewsletterSection";
import CartDrawer from "@/components/luxury/CartDrawer";
import PixModal from "@/components/luxury/PixModal";
import NotifyModal from "@/components/luxury/NotifyModal";
import AdminAuthModal from "@/components/luxury/AdminAuthModal";
import AdminPanel from "@/components/luxury/AdminPanel";
import QuickViewModal from "@/components/luxury/QuickViewModal";
import SlideInQuickView, {
  useSlideInUI,
} from "@/components/luxury/SlideInQuickView";
import FavoritesModal from "@/components/luxury/FavoritesModal";
import FloatingWhatsApp from "@/components/luxury/FloatingWhatsApp";
import FloatingCompareButton from "@/components/luxury/FloatingCompareButton";
import CompareModal from "@/components/luxury/CompareModal";
import CursorCanvas from "@/components/luxury/CursorCanvas";
import PwaInstallBanner from "@/components/luxury/PwaInstallBanner";
import WelcomeModal from "@/components/luxury/WelcomeModal";
import NotificationManager from "@/components/luxury/NotificationManager";
import SiteFooter from "@/components/luxury/SiteFooter";
import ServiceWorkerRegister from "@/components/luxury/ServiceWorkerRegister";
import { useUI, useStore } from "@/lib/stores-combined";
import { syncContentFromD1 } from "@/lib/content-store";
import { useCouponStore } from "@/lib/coupon-store";
import { useKitStore } from "@/lib/kit-store";
import { syncPinnedFromD1 } from "@/components/luxury/AdminPanel";
import { Toaster } from "sonner";

export default function Home() {
  const setCartOpen = useUI((s) => s.setCartOpen);
  const setFavoritesOpen = useUI((s) => s.setFavoritesOpen);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const favorites = useStore((s) => s.favorites);
  const syncFromD1 = useStore((s) => s.syncFromD1);
  const syncCouponsFromD1 = useCouponStore((s) => s.syncCouponsFromD1);
  const syncKitsFromD1 = useKitStore((s) => s.syncKitsFromD1);
  const openSlideIn = useSlideInUI((s) => s.openSlideInQuickView);

  // Listen for "openSlideIn" custom events from any component
  // (e.g., PinnedProductBanner can trigger this instead of central QuickView)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        openSlideIn(detail);
      }
    };
    window.addEventListener("openSlideIn", handler);
    return () => window.removeEventListener("openSlideIn", handler);
  }, [openSlideIn]);

  // Sync content store from D1 (source of truth) on app mount.
  // localStorage cache (handled by persist middleware) renders instantly while
  // D1 values overwrite in the background for cross-device consistency.
  useEffect(() => {
    syncContentFromD1();
  }, []);

  // D1 SYNC — fetch products, leads, pix config, coupons, kits, and pinned
  // config from D1 on app mount.
  // localStorage cache renders instantly; D1 values overwrite in the background.
  // All fetches are non-blocking and fail silently to localStorage fallback.
  useEffect(() => {
    if (typeof window === "undefined") return;
    void syncFromD1().catch((err) =>
      console.warn("[D1 sync] app mount failed:", err)
    );
    void syncCouponsFromD1().catch((err) =>
      console.warn("[D1 sync] coupons mount failed:", err)
    );
    void syncKitsFromD1().catch((err) =>
      console.warn("[D1 sync] kits mount failed:", err)
    );
    void syncPinnedFromD1().catch((err) =>
      console.warn("[D1 sync] pinned mount failed:", err)
    );
  }, [syncFromD1, syncCouponsFromD1, syncKitsFromD1]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("cart") === "open") {
      setCartOpen(true);
    }
    // Wishlist compartilhável: ?wishlist=bc-001,bc-012,dec-05
    const wishlistParam = params.get("wishlist");
    if (wishlistParam) {
      const ids = wishlistParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length > 0) {
        // Adiciona IDs que ainda não estão nos favoritos
        ids.forEach((id) => {
          if (!favorites.includes(id)) {
            toggleFavorite(id);
          }
        });
        // Abre o modal de favoritos para mostrar a wishlist compartilhada
        setTimeout(() => setFavoritesOpen(true), 800);
      }
    }
  }, []);

  return (
    <>
      <CursorCanvas />
      <ServiceWorkerRegister />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "rgba(18,20,29,0.92)",
            border: "1px solid rgba(212,175,55,0.4)",
            color: "#fef9e7",
            backdropFilter: "blur(12px)",
          },
        }}
      />

      <div className="flex-grow flex flex-col">
        <AnnouncementBar />
        <UrgencyBanner />
        <Header />
        <main className="flex-grow">
          <Hero />
          <PinnedProductBanner />
          <PromoKits />
          <SeasonalBanner />
          <FeaturedCarousel />
          <StatsBar />
          <ScentMatcher />
          <CatalogGrid />
          <TrustBadges />
          <SubscriptionPlans />
          <InstagramShopping />
          <HowToUse />
          <FAQSection />
          <OlfactoryQuiz />
          <ReferralSystem />
          <RecentlyViewed />
        </main>
        <SiteFooter />
      </div>

      {/* Modals & Drawers */}
      <WelcomeModal />
      <CartDrawer />
      <PixModal />
      <NotifyModal />
      <QuickViewModal />
      <SlideInQuickView />
      <FavoritesModal />
      <CompareModal />
      <AdminAuthModal />
      <AdminPanel />
      <PwaInstallBanner />
      <NotificationManager />
      <FloatingWhatsApp />
      <FloatingCompareButton />
    </>
  );
}
