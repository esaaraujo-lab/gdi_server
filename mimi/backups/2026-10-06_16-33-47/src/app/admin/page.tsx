"use client";

import { useEffect } from "react";
import { AnnouncementBar } from "@/components/luxury/Header";
import Header from "@/components/luxury/Header";
import Hero from "@/components/luxury/Hero";
import PinnedProductBanner from "@/components/luxury/PinnedProductBanner";
import PromoKits from "@/components/luxury/PromoKits";
import UrgencyBanner from "@/components/luxury/UrgencyBanner";
import FeaturedCarousel from "@/components/luxury/FeaturedCarousel";
import StatsBar from "@/components/luxury/StatsBar";
import ScentMatcher from "@/components/luxury/ScentMatcher";
import CatalogGrid from "@/components/luxury/CatalogGrid";
import HowToUse from "@/components/luxury/HowToUse";
import SeasonalBanner from "@/components/luxury/SeasonalBanner";
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
import SlideInQuickView, { useSlideInUI } from "@/components/luxury/SlideInQuickView";
import FavoritesModal from "@/components/luxury/FavoritesModal";
import FloatingWhatsApp from "@/components/luxury/FloatingWhatsApp";
import FloatingCompareButton from "@/components/luxury/FloatingCompareButton";
import CompareModal from "@/components/luxury/CompareModal";
import CursorCanvas from "@/components/luxury/CursorCanvas";
import PwaInstallBanner from "@/components/luxury/PwaInstallBanner";
import NotificationManager from "@/components/luxury/NotificationManager";
import SiteFooter from "@/components/luxury/SiteFooter";
import ServiceWorkerRegister from "@/components/luxury/ServiceWorkerRegister";
import { useUI, useStore } from "@/lib/stores-combined";
import { syncProductsFromD1, syncLeadsFromD1, syncPixConfigFromD1 } from "@/lib/store";
import { syncContentFromD1 } from "@/lib/content-store";
import { syncKitsFromD1 } from "@/lib/kit-store";
import { syncCouponsFromD1 } from "@/lib/coupon-store";
import { syncReviewsFromD1 } from "@/lib/review-store";
import { Toaster } from "sonner";

/**
 * /admin route — renders the full store page AND auto-opens the admin auth
 * modal on mount. This replaces the old header admin button (now removed
 * from the public UI for security/stealth).
 *
 * After successful login, the AdminPanel overlay opens automatically.
 */
export default function AdminRoute() {
  const setAdminAuthOpen = useUI((s) => s.setAdminAuthOpen);
  const openSlideIn = useSlideInUI((s) => s.openSlideInQuickView);
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);

  // Auto-open admin auth modal on mount
  useEffect(() => {
    const timer = setTimeout(() => setAdminAuthOpen(true), 500);
    return () => clearTimeout(timer);
  }, [setAdminAuthOpen]);

  // Listen for "openSlideIn" custom events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) openSlideIn(detail);
    };
    window.addEventListener("openSlideIn", handler);
    return () => window.removeEventListener("openSlideIn", handler);
  }, [openSlideIn]);

  // D1 sync on mount — pull ALL data so admin sees everything
  useEffect(() => {
    void syncProductsFromD1();
    void syncContentFromD1();
    void syncKitsFromD1();
    void syncCouponsFromD1();
    void syncReviewsFromD1();
    void syncLeadsFromD1();
    void syncPixConfigFromD1();
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
      <PwaInstallBanner />
      <NotificationManager />
      <FloatingWhatsApp />
      <FloatingCompareButton />
    </>
  );
}
