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

export function GuestRoute() {
  const user = useAuthStore((s) => s.user);
  const booting = useAuthStore((s) => s.booting);
  if (booting) return null;
  if (user) return <Navigate to="/terminal" replace />;
  return <Outlet />;
}
