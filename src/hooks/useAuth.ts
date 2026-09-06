import { useAuthStore } from '@/stores/authStore';

// Central auth hook shared by the web application.
export function useAuth() {
  return useAuthStore();
}
