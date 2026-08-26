import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { useThemeStore } from "./store/theme";
import { useEnsurePriceSocket } from "./hooks/useLivePrices";
import { useBinanceTickerFeed } from "./hooks/useBinanceTickerFeed";
import { TopBar } from "./components/layout/TopBar";
import { ActiveBotsBanner } from "./components/layout/ActiveBotsBanner";
import { EmailVerificationBanner } from "./components/layout/EmailVerificationBanner";
import { Toaster } from "./components/common/Toaster";
import { AdminRoute, GuestRoute, ProtectedRoute } from "./routes/ProtectedRoute";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { LegalPage } from "./pages/LegalPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { OverviewPage } from "./pages/OverviewPage";
import { TerminalPage } from "./pages/TerminalPage";
import { MarketsPage } from "./pages/MarketsPage";
import { StrategiesPage } from "./pages/StrategiesPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminPage } from "./pages/AdminPage";
import { Spinner } from "./components/common/States";

function AppLayout() {
  const location = useLocation();
  return (
    <div className="app-shell flex flex-col bg-bg-0 text-txt-0">
      <TopBar />
      <EmailVerificationBanner />
      <ActiveBotsBanner />
      <div className="min-h-0 flex-1">
        <div key={location.pathname} className="page-transition h-full">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function BootScreen() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg-0">
      <div className="flex flex-col items-center gap-3">
        <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden>
          <rect width="32" height="32" rx="6" fill="#0b0e14" />
          <path d="M8 9l8 15 8-15h-3.4L16 19.6 10.4 9H8z" fill="#17c885" />
        </svg>
        <Spinner size={18} />
      </div>
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
  }, [bootstrap]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  if (booting) return <BootScreen />;

  return (
    <>
      <Toaster />
      <Routes>
        {/* Public regardless of auth state — the exchange Home, and the
            privacy policy linked from the register form */}
        <Route path="/" element={<HomePage />} />
        <Route path="/legal/privacy" element={<LegalPage />} />
        {/* Reached from a link in an inbox, which may be on a different device
            from the one that's signed in — so these must work in either state,
            and cannot sit behind GuestRoute or ProtectedRoute. */}
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

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
                Settings folded into Profile — all kept as redirects for old links/bookmarks. */}
            <Route path="/portfolio" element={<Navigate to="/profile" replace />} />
            <Route path="/orders" element={<Navigate to="/profile" replace />} />
            <Route path="/alerts" element={<Navigate to="/terminal" replace />} />
            <Route path="/settings" element={<Navigate to="/profile" replace />} />
            <Route path="/strategies" element={<StrategiesPage />} />
            <Route path="/profile" element={<ProfilePage />} />
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
