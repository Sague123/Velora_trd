import { useEffect, useRef } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { useThemeStore } from "./store/theme";
import { NAV_ORDER } from "./lib/nav";
import { useEnsurePriceSocket } from "./hooks/useLivePrices";
import { useBinanceTickerFeed } from "./hooks/useBinanceTickerFeed";
import { useIsMobile } from "./hooks/useIsMobile";
import { Header } from "./components/layout/Header";
import { MobileBottomStack } from "./components/layout/MobileBottomStack";
import { Toaster } from "./components/common/Toaster";
import { AdminRoute, GuestRoute, ManagerRoute, ProtectedRoute } from "./routes/ProtectedRoute";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { LegalPage } from "./pages/LegalPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { CrmViewPage } from "./pages/CrmViewPage";
import { OverviewPage } from "./pages/OverviewPage";
import { TerminalPage } from "./pages/TerminalPage";
import { MarketsPage } from "./pages/MarketsPage";
import { StrategiesPage } from "./pages/StrategiesPage";
import { SavingsPage } from "./pages/SavingsPage";
import { CrmPage } from "./pages/CrmPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminPage } from "./pages/AdminPage";
import { SettingsPage } from "./pages/SettingsPage";
import { hideSplash } from "./lib/splash";
import { useUserSettings } from "./store/userSettings";

function AppLayout() {
  const location = useLocation();
  const isMobile = useIsMobile();
  // Read before this render's pathname overwrites it (the write happens in
  // the effect below, after commit) — so `prevPathRef.current` is still the
  // *previous* route while `location.pathname` is already the new one. That
  // lets the slide direction match which way a nav click actually moved, the
  // same way switching tabs on a phone slides toward the tab you tapped
  // rather than always sliding the same way. Tap-only: there is no swipe
  // gesture on this shell any more (see git history if that's ever wanted
  // back), so this only ever reacts to a route change from a nav click.
  const prevPathRef = useRef(location.pathname);
  const prevIdx = NAV_ORDER.indexOf(prevPathRef.current);
  const curIdx = NAV_ORDER.indexOf(location.pathname);
  const slideClass = prevIdx !== -1 && curIdx !== -1 && curIdx < prevIdx ? "page-slide-left" : "page-slide-right";

  useEffect(() => {
    prevPathRef.current = location.pathname;
  }, [location.pathname]);

  return (
    <div className="app-shell flex flex-col bg-bg-0 text-txt-0">
      {/* Unverified-email and running-bot state used to render here as
          desktop-only full-width banners while the phone got the same two
          facts as icons in the header. Both platforms get the icons now
          (Header → StatusIcons), so the shell is header + page + bottom bar
          and nothing else. */}
      <Header />
      <div
        className="min-h-0 flex-1"
        // Reserves exactly the height the pinned bottom block reports for
        // itself (MobileBottomStack publishes it), so page content ends above
        // it instead of hiding underneath — and so the reservation follows the
        // block when it grows an extra tier on the terminal.
        style={isMobile ? { paddingBottom: "var(--mobile-stack-h, 0px)" } : undefined}
      >
        <div key={location.pathname} className={`${slideClass} h-full`}>
          <Outlet />
        </div>
      </div>
      <MobileBottomStack />
    </div>
  );
}

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const booting = useAuthStore((s) => s.booting);
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  // No bot runner here any more: strategies tick on the server
  // (server/src/engine/strategy.ts), so nothing about whether a bot trades
  // depends on this tab being open — which also retires the "a bot was still
  // running from last time, resume it?" gate this screen used to need.
  useEnsurePriceSocket();
  useBinanceTickerFeed();

  useEffect(() => {
    bootstrap();
    // Density and motion from the last saved settings, before anything
    // fetches, so a reload doesn't paint once compact and then re-flow.
    const a = useUserSettings.getState().settings.appearance;
    document.documentElement.dataset.density = a.density;
    document.documentElement.dataset.motion = a.animations ? "on" : "off";
  }, [bootstrap]);

  // The signed-in user's saved preferences are the authority once known.
  const userId = user?.id;
  useEffect(() => {
    if (userId) void useUserSettings.getState().load().catch(() => undefined);
    else useUserSettings.getState().reset();
  }, [userId]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // The splash from index.html covers the screen until auth has resolved;
  // rendering nothing underneath it avoids a flash of the wrong route.
  useEffect(() => {
    if (!booting) hideSplash();
  }, [booting]);

  if (booting) return null;

  return (
    <>
      <Toaster />
      <Routes>
        {/* The public exchange Home is for visitors who aren't signed in.
            A signed-in user landing here used to get a second, unrelated
            chrome — HomeNavbar's own logo casing, icon set and tab names on
            top of the app they were already inside — which is the single
            biggest reason the product read as "glued together". Signed in,
            `/` goes to the dashboard; signed out, it's still the storefront. */}
        <Route path="/" element={user ? <Navigate to="/overview" replace /> : <HomePage />} />
        {/* The same marketing page, always reachable regardless of auth state
            — unlike `/` above, this never redirects a signed-in visitor away.
            Nothing in the authenticated app's own chrome (Header's logo,
            the nav) points here on purpose: for someone already signed in,
            "home" is still the dashboard. This exists for the places that
            had no link to the storefront at all — the site footer's logo —
            so the marketing page stays reachable without signing out. */}
        <Route path="/home" element={<HomePage />} />
        <Route path="/legal/privacy" element={<LegalPage />} />
        {/* Reached from a link in an inbox, which may be on a different device
            from the one that's signed in — so these must work in either state,
            and cannot sit behind GuestRoute or ProtectedRoute. */}
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        {/* A one-time CRM support link opens in a fresh tab that may have no
            Velora session at all — the token itself is the only credential,
            so this also cannot sit behind ManagerRoute or ProtectedRoute. */}
        <Route path="/crm/view" element={<CrmViewPage />} />

        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/terminal" element={<TerminalPage />} />
            <Route path="/markets" element={<MarketsPage />} />
            {/* Portfolio/Orders moved into Profile; Alerts moved into the Trade terminal;
                kept as redirects for old links/bookmarks. Settings has its own page again. */}
            <Route path="/portfolio" element={<Navigate to="/profile" replace />} />
            <Route path="/orders" element={<Navigate to="/profile" replace />} />
            <Route path="/alerts" element={<Navigate to="/terminal" replace />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/:section" element={<SettingsPage />} />
            <Route path="/strategies" element={<StrategiesPage />} />
            <Route path="/savings" element={<SavingsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route element={<ManagerRoute />}>
              <Route path="/crm" element={<CrmPage />} />
            </Route>
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to={user ? "/terminal" : "/login"} replace />} />
      </Routes>
    </>
  );
}
