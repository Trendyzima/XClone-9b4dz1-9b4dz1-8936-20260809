import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';
import { AuthUser } from '@/types/app-types';

const PRODUCTION_AUTH_REDIRECT = 'https://testagram.site/auth';

export function mapSupabaseUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email!,
    username: user.user_metadata?.username || user.user_metadata?.full_name || user.email!.split('@')[0],
    avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture,
  };
}

export class AuthService {
  async sendOtp(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: PRODUCTION_AUTH_REDIRECT,
      },
    });
    if (error) throw error;
  }

  async verifyOtpAndSetPassword(email: string, token: string, password: string) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error) throw error;

    const username = email.split('@')[0];
    const { data: updateData, error: updateError } = await supabase.auth.updateUser({
      password,
      data: { username },
    });
    if (updateError) throw updateError;

    return updateData.user;
  }

  async signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: PRODUCTION_AUTH_REDIRECT },
    });
    if (error) throw error;
  }

  async signInWithGitHub() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: PRODUCTION_AUTH_REDIRECT },
    });
    if (error) throw error;
  }

  async signInWithPassword(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data.user;
  }

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  mapUser(user: User): AuthUser {
    return mapSupabaseUser(user);
  }
}

export const authService = new AuthService();
