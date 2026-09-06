import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSEO } from '@/hooks/useSEO';

function AuthAdBanner() {
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return;
    ref.current = true;
    try { ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}); } catch (_) {}
  }, []);
  return (
    <ins
      className="adsbygoogle"
      style={{ display: 'block' }}
      data-ad-client="ca-pub-2458567543017441"
      data-ad-slot="2031881558"
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-5 h-5">
      <path fill="#4285F4" d="M21.35 12.2c0-.72-.06-1.42-.18-2.1H12v3.98h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.27Z" />
      <path fill="#34A853" d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.5Z" />
      <path fill="#FBBC05" d="M6.54 13.58a5.86 5.86 0 0 1 0-3.16V7.89H3.3a9.75 9.75 0 0 0 0 8.22l3.24-2.53Z" />
      <path fill="#EA4335" d="M12 6.39c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.46 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53C7.31 8.11 9.46 6.39 12 6.39Z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-5 h-5 fill-current">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.17c-3.23.7-3.91-1.56-3.91-1.56-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.04 1.78 2.72 1.27 3.38.97.11-.75.41-1.27.74-1.56-2.58-.29-5.29-1.29-5.29-5.74 0-1.27.45-2.31 1.19-3.12-.12-.29-.52-1.48.11-3.08 0 0 .97-.31 3.16 1.19a10.9 10.9 0 0 1 5.76 0c2.19-1.5 3.16-1.19 3.16-1.19.63 1.6.23 2.79.11 3.08.74.81 1.19 1.85 1.19 3.12 0 4.46-2.72 5.44-5.31 5.73.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

export default function AuthPage() {
  useSEO({ noindex: true, title: 'Sign In', url: '/auth' });
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referrerIdRef = useRef(searchParams.get('ref'));
  const { login } = useAuthStore();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      localStorage.setItem('ts-pending-ref', ref);
      if (mode === 'signin') setMode('signup');
    }
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await authService.signInWithGoogle();
    } catch (error: any) {
      toast({ title: 'Google sign-in unavailable', description: error.message, variant: 'destructive' });
      setLoading(false);
    }
  };

  const handleGitHubSignIn = async () => {
    setLoading(true);
    try {
      await authService.signInWithGitHub();
    } catch (error: any) {
      toast({ title: 'GitHub sign-in unavailable', description: error.message, variant: 'destructive' });
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await authService.signInWithPassword(email, password);
      login(authService.mapUser(user));
      navigate('/');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
    }
  };

  const sendOtp = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await authService.sendOtp(email.trim());
      setMode('verify');
      setOtp('');
      toast({ title: 'Success', description: 'A 6-digit verification code was sent to your email' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendOtp();
  };

  const recordReferral = async (newUserId: string) => {
    const refUsername = localStorage.getItem('ts-pending-ref') ?? referrerIdRef.current;
    if (!refUsername) return;
    localStorage.removeItem('ts-pending-ref');
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refUsername);
    let referrerId: string | null = null;
    if (isUuid) {
      referrerId = refUsername;
    } else {
      const { data: refProfile } = await supabase.from('user_profiles').select('id').eq('username', refUsername).maybeSingle();
      referrerId = refProfile?.id ?? null;
    }
    if (!referrerId || referrerId === newUserId) return;
    const { error } = await supabase
      .from('referrals')
      .insert({ invited_by: referrerId, invited_user: newUserId, credits_awarded: 100 })
      .select()
      .single();
    if (error) return;
    await supabase.rpc('add_to_wallet', { p_user_id: referrerId, p_amount: 100 }).then(() => {}, () => {});
    await supabase.rpc('add_to_wallet', { p_user_id: newUserId, p_amount: 100 }).then(() => {}, () => {});
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await authService.verifyOtpAndSetPassword(email.trim(), otp.trim(), password);
      recordReferral(user.id).then(() => {}, () => {});
      login(authService.mapUser(user));
      navigate('/');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
    }
  };

  const pendingRef = typeof window !== 'undefined' ? (localStorage.getItem('ts-pending-ref') ?? searchParams.get('ref')) : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <AuthAdBanner />
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary mb-6">
            <span className="text-4xl font-bold text-primary-foreground">T</span>
          </div>
          <h2 className="text-3xl font-bold">
            {mode === 'signin' ? 'Sign in to T' : mode === 'signup' ? 'Join T today' : 'Verify your email'}
          </h2>
          {pendingRef && mode !== 'signin' && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
              <span className="text-xs font-bold text-primary">🎁 Invited by @{pendingRef}</span>
              <span className="text-[10px] text-muted-foreground">· You'll both get 100 credits</span>
            </div>
          )}
        </div>

        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <Button type="button" variant="outline" className="w-full h-12 rounded-full gap-3" onClick={handleGoogleSignIn} disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <GoogleMark />}
              Continue with Google
            </Button>
            <Button type="button" variant="outline" className="w-full h-12 rounded-full gap-3" onClick={handleGitHubSignIn} disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <GitHubMark />}
              Continue with GitHub
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span>OR CONTINUE WITH EMAIL</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-14" />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-14" />
            <Button type="submit" className="w-full h-12 rounded-full" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign in with email'}
            </Button>
            <div className="text-center">
              <button type="button" onClick={() => setMode('signup')} className="text-primary hover:underline">
                Don't have an account? Sign up
              </button>
            </div>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <Button type="button" variant="outline" className="w-full h-12 rounded-full gap-3" onClick={handleGoogleSignIn} disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <GoogleMark />}
              Continue with Google
            </Button>
            <Button type="button" variant="outline" className="w-full h-12 rounded-full gap-3" onClick={handleGitHubSignIn} disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <GitHubMark />}
              Continue with GitHub
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span>OR SIGN UP WITH EMAIL</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-14" />
            <Button type="submit" className="w-full h-12 rounded-full" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continue with email'}
            </Button>
            <div className="text-center">
              <button type="button" onClick={() => setMode('signin')} className="text-primary hover:underline">
                Already have an account? Sign in
              </button>
            </div>
          </form>
        )}

        {mode === 'verify' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <p className="text-muted-foreground text-center">Enter the 6-digit code sent to {email}</p>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              placeholder="6-digit verification code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              maxLength={6}
              className="h-14 text-center text-2xl tracking-widest"
            />
            <Input type="password" placeholder="Create password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="h-14" />
            <Button type="submit" className="w-full h-12 rounded-full" disabled={loading || otp.length !== 6}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify and create account'}
            </Button>
            <div className="text-center">
              <button type="button" onClick={sendOtp} className="text-primary hover:underline text-sm" disabled={loading}>
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
