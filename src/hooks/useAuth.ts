import { useAuthStore } from '@/stores/authStore';

// Production auth hook shared by the web application.
export function useAuth() {
  return useAuthStore();
}
