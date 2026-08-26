import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export function ProtectedRoute() {
  const user = useAuthStore((s) => s.user);
  const booting = useAuthStore((s) => s.booting);
  const location = useLocation();

  if (booting) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

export function AdminRoute() {
  const user = useAuthStore((s) => s.user);
  const booting = useAuthStore((s) => s.booting);
  if (booting) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "ADMIN") return <Navigate to="/terminal" replace />;
  return <Outlet />;
}

/**
 * The CRM. Managers and admins only — a MANAGER cannot reach /admin and a
 * regular user cannot reach either. A logged-in user who lands here by URL is
 * sent to the terminal rather than the login page: they *are* signed in, and
 * bouncing them to a login form would be a lie about why they were refused.
 */
export function ManagerRoute() {
  const user = useAuthStore((s) => s.user);
  const booting = useAuthStore((s) => s.booting);
  if (booting) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "MANAGER" && user.role !== "ADMIN") return <Navigate to="/terminal" replace />;
  return <Outlet />;
}

export function GuestRoute() {
  const user = useAuthStore((s) => s.user);
  const booting = useAuthStore((s) => s.booting);
  if (booting) return null;
  if (user) return <Navigate to="/terminal" replace />;
  return <Outlet />;
}
