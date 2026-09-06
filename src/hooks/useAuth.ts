import { useAuthStore } from '@/stores/authStore';

// Production auth hook shared by the web application and route guards.
// The recovery gate validates source integrity before typecheck.
export function useAuth() {
  return useAuthStore();
}
