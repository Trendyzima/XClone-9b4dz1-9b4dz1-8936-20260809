import { useAuthStore } from '@/stores/authStore';

// Production auth hook shared by the web application and route guards.
export function useAuth() {
  return useAuthStore();
}
