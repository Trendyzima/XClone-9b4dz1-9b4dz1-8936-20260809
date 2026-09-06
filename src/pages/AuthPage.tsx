import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Github, Loader2, Mail } from 'lucide-react';
import { authService } from '@/lib/auth';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSEO } from '@/hooks/useSEO';

function GoogleMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="w-5 h-5"><path fill="#4285F4" d="M21.35 12.2c0-.72-.06-1.42-.18-2.1H12v3.98h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.27Z"/><path fill="#34A853" d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.5Z"/><path fill="#FBBC05" d="M6.54 13.58a5.86 5.86 0 0 1 0-3.16V7.89H3.3a9.75 9.75 0 0 0 0 8.22l3.24-2.53Z"/><path fill="#EA4335" d="M12 6.39c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.46 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53C7.31 8.11 9.46 6.39 12 6.39Z"/></svg>;
}

export default function AuthPage() {
  useSEO({ noindex: true, title: 'Sign in', url: '/auth' });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { login } = useAuthStore();
  const { toast } = useToast();
  const [mode, setMode] = useState<'signin' | 'signup' | 'verify'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    const error = searchParams.get('error_description') || searchParams.get('error');
    if (error) toast({ title: 'Authentication failed', description: error.replace(/\+/g, ' '), variant: 'destructive' });
  }, [searchParams, toast]);

  const run = async (action: () => Promise<void>, success?: string) => {
    setLoading(true);
    try {
      await action();
      if (success) toast({ title: 'Success', description: success });
    } catch (error: any) {
      toast({ title: 'Authentication error', description: error?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const signInEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const authUser = await authService.signInWithPassword(email, password);
      if (authUser) login(authService.mapUser(authUser));
      navigate('/', { replace: true });
    });
  };

  const sendOtp = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!email.trim()) return;
    await run(async () => {
      await authService.sendOtp(email);
      setMode('verify');
      setOtp('');
    }, 'A 6-digit verification code was sent to your email.');
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (otp.length !== 6 || password.length < 6) return;
    await run(async () => {
      const authUser = await authService.verifyOtpAndSetPassword(email, otp, password);
      if (authUser) login(authService.mapUser(authUser));
      navigate('/', { replace: true });
    });
  };

  const social = (provider: 'google' | 'github') => run(async () => {
    if (provider === 'google') await authService.signInWithGoogle();
    else await authService.signInWithGitHub();
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8"><div className="mx-auto w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-3xl font-black">T</div><h1 className="mt-5 text-3xl font-black">{mode === 'verify' ? 'Verify your email' : mode === 'signup' ? 'Join Testagram' : 'Welcome back'}</h1><p className="mt-2 text-sm text-muted-foreground">Production authentication for testagram.site</p></div>

        {mode !== 'verify' && <div className="space-y-3">
          <Button type="button" variant="outline" className="w-full h-12 rounded-full gap-3" disabled={loading} onClick={() => social('google')}><GoogleMark />Continue with Google</Button>
          <Button type="button" variant="outline" className="w-full h-12 rounded-full gap-3" disabled={loading} onClick={() => social('github')}><Github className="w-5 h-5" />Continue with GitHub</Button>
          <div className="flex items-center gap-3 py-2 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border"/><span>OR</span><span className="h-px flex-1 bg-border"/></div>
        </div>}

        {mode === 'signin' && <form onSubmit={signInEmail} className="space-y-4"><div><label className="text-sm font-semibold">Email</label><Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1 h-12" /></div><div><label className="text-sm font-semibold">Password</label><Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required className="mt-1 h-12" /></div><Button className="w-full h-12 rounded-full" disabled={loading}>{loading ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Mail className="w-4 h-4 mr-2"/>Sign in with email</>}</Button><button type="button" className="w-full text-sm text-primary hover:underline" onClick={() => setMode('signup')}>New to Testagram? Create an account</button></form>}

        {mode === 'signup' && <form onSubmit={sendOtp} className="space-y-4"><div><label className="text-sm font-semibold">Email</label><Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1 h-12" /></div><Button className="w-full h-12 rounded-full" disabled={loading}>{loading ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Send verification code'}</Button><button type="button" className="w-full text-sm text-primary hover:underline" onClick={() => setMode('signin')}>Already have an account? Sign in</button></form>}

        {mode === 'verify' && <form onSubmit={verify} className="space-y-4"><p className="text-sm text-muted-foreground text-center">Enter the 6-digit code sent to <strong>{email}</strong>.</p><Input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" className="h-14 text-center text-2xl tracking-[0.5em]" required/><div><label className="text-sm font-semibold">Create password</label><Input type="password" autoComplete="new-password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required className="mt-1 h-12" /></div><Button className="w-full h-12 rounded-full" disabled={loading || otp.length !== 6 || password.length < 6}>{loading ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Verify and create account'}</Button><button type="button" className="w-full text-sm text-primary hover:underline" disabled={loading} onClick={() => void sendOtp()}>Resend code</button></form>}

        <div className="mt-8 text-center text-xs text-muted-foreground">By continuing, you agree to Testagram's terms and privacy policy.</div>
      </div>
    </div>
  );
}
