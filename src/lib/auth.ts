import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';
import { AuthUser } from '@/types/app-types';

const PRODUCTION_AUTH_REDIRECT = 'https://testagram.site/auth';

function cleanUsername(value: unknown): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return normalized.length >= 3 ? normalized : '';
}

function preferredUsername(user: User): string {
  const metadata = user.user_metadata ?? {};
  return (
    cleanUsername(metadata.username) ||
    cleanUsername(metadata.preferred_username) ||
    cleanUsername(metadata.user_name) ||
    cleanUsername(user.email?.split('@')[0]) ||
    `user_${user.id.replace(/-/g, '').slice(0, 10)}`
  );
}

export function mapSupabaseUser(user: User): AuthUser {
  const metadata = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? '',
    username: cleanUsername(metadata.username) || cleanUsername(metadata.preferred_username) || cleanUsername(metadata.user_name) || cleanUsername(user.email?.split('@')[0]) || `user_${user.id.replace(/-/g, '').slice(0, 10)}`,
    avatar: metadata.avatar_url || metadata.picture,
    verified: Boolean(metadata.email_verified),
  };
}

export class AuthService {
  async ensureProfile(user: User) {
    const username = preferredUsername(user);
    const metadata = user.user_metadata ?? {};
    const displayName = String(metadata.full_name || metadata.name || '').trim();
    const avatarUrl = String(metadata.avatar_url || metadata.picture || '').trim() || null;

    const { data: existing, error: readError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    if (readError) throw readError;

    if (!existing) {
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          username,
          display_name: displayName,
          avatar_url: avatarUrl,
        })
        .select('id, username, display_name, avatar_url')
        .single();
      if (error) {
        // The database trigger normally creates this row. A concurrent OAuth/email
        // callback can race the client, so re-read before surfacing the error.
        const { data: raced } = await supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', user.id).maybeSingle();
        if (!raced) throw error;
        return raced;
      }
      return data;
    }

    const looksGenerated = existing.username?.startsWith('user_') || !existing.username;
    if (looksGenerated || (!existing.display_name && displayName) || (!existing.avatar_url && avatarUrl)) {
      const patch: Record<string, string | null> = {};
      if (looksGenerated) patch.username = username;
      if (!existing.display_name && displayName) patch.display_name = displayName;
      if (!existing.avatar_url && avatarUrl) patch.avatar_url = avatarUrl;
      if (Object.keys(patch).length) {
        const { data, error } = await supabase.from('profiles').update(patch).eq('id', user.id).select('id, username, display_name, avatar_url').single();
        if (error) throw error;
        return data;
      }
    }
    return existing;
  }

  async sendOtp(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: PRODUCTION_AUTH_REDIRECT,
      },
    });
    if (error) throw error;
  }

  async verifyOtpAndSetPassword(email: string, token: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: token.trim(),
      type: 'email',
    });
    if (error) throw error;
    if (!data.user) throw new Error('Verification succeeded but no user session was created.');

    const username = preferredUsername(data.user);
    const { data: updateData, error: updateError } = await supabase.auth.updateUser({
      password,
      data: { username },
    });
    if (updateError) throw updateError;
    if (updateData.user) await this.ensureProfile(updateData.user);
    return updateData.user;
  }

  async signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: PRODUCTION_AUTH_REDIRECT,
        scopes: 'openid email profile',
      },
    });
    if (error) throw error;
  }

  async signInWithGitHub() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: PRODUCTION_AUTH_REDIRECT,
        scopes: 'read:user user:email',
      },
    });
    if (error) throw error;
  }

  async signInWithPassword(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
    if (data.user) await this.ensureProfile(data.user);
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
