import { useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";

export function usePermissions() {
  const { permissions } = useAuth();
  const hasPermission = useCallback((permission: string) => permissions.includes(permission), [permissions]);
  const hasAnyPermission = useCallback((required: string[]) => required.some(hasPermission), [hasPermission]);
  return { permissions, hasPermission, hasAnyPermission };
}
