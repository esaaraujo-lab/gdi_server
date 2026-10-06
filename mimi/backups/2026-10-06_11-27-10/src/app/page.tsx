"use client";

import { useEffect } from "react";
import { AnnouncementBar } from "@/components/luxury/Header";
import Header from "@/components/luxury/Header";
import Hero from "@/components/luxury/Hero";
import PinnedProductBanner from "@/components/luxury/PinnedProductBanner";
import PromoKits from "@/components/luxury/PromoKits";
import UrgencyBanner from "@/components/luxury/UrgencyBanner";
import WelcomeModal from "@/components/luxury/WelcomeModal";
import FeaturedCarousel from "@/components/luxury/FeaturedCarousel";
import CatalogGrid from "@/components/luxury/CatalogGrid";
import HowToUse from "@/components/luxury/HowToUse";
import SeasonalBanner from "@/components/luxury/SeasonalBanner";
import SubscriptionPlans from "@/components/luxury/SubscriptionPlans";
import InstagramShopping from "@/components/luxury/InstagramShopping";
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
import CompareModal from "@/components/luxury/CompareModal";
import CursorCanvas from "@/components/luxury/CursorCanvas";
import SiteFooter from "@/components/luxury/SiteFooter";
import ServiceWorkerRegister from "@/components/luxury/ServiceWorkerRegister";
import { useUI, useStore } from "@/lib/stores-combined";
import { syncContentFromD1 } from "@/lib/content-store";
import { syncKitsFromD1 } from "@/lib/kit-store";
import { syncProductsFromD1, syncLeadsFromD1, syncPixConfigFromD1 } from "@/lib/store";
import { syncCouponsFromD1 } from "@/lib/coupon-store";
import { syncReviewsFromD1 } from "@/lib/review-store";
import { syncPromotionsFromD1 } from "@/lib/promotion-store";
import { Toaster } from "sonner";

export default function Home() {
  const setCartOpen = useUI((s) => s.setCartOpen);
  const setFavoritesOpen = useUI((s) => s.setFavoritesOpen);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const favorites = useStore((s) => s.favorites);
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

  // D1 sync — pull all data from D1 on mount (fire-and-forget, non-blocking)
  useEffect(() => {
    void syncProductsFromD1();
    void syncContentFromD1();
    void syncKitsFromD1();
    void syncCouponsFromD1();
    void syncReviewsFromD1();
    void syncLeadsFromD1();
    void syncPixConfigFromD1();
    void syncPromotionsFromD1();
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

      <div id="cart-push-wrapper" className="flex-grow flex flex-col">
        <AnnouncementBar />
        <UrgencyBanner />
        <Header />
        <main className="flex-grow">
          <Hero />
          <PinnedProductBanner />
          <PromoKits />
          <SeasonalBanner />
          <FeaturedCarousel />
          <CatalogGrid />
          <SubscriptionPlans />
          <InstagramShopping />
          <HowToUse />
          <OlfactoryQuiz />
          <ReferralSystem />
          <RecentlyViewed />
          <NewsletterSection />
        </main>
        <SiteFooter />
      </div>

      {/* Modals & Drawers */}
      <CartDrawer />
      <PixModal />
      <NotifyModal />
      <QuickViewModal />
      <SlideInQuickView />
      <FavoritesModal />
      <CompareModal />
      <AdminAuthModal />
      <AdminPanel />
      <WelcomeModal />
    </>
  );
}
