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

export default function AuthPage() {
  useSEO({ noindex: true, title: 'Sign In', url: '/auth' });
  const [mode, setMode] = useState<'signin' | 'signup' | 'verify'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referrerIdRef = useRef<string | null>(searchParams.get('ref'));
  const { login } = useAuthStore();

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

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authService.sendOtp(email);
      setMode('verify');
      toast({ title: 'Success', description: 'Verification code sent to your email' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const recordReferral = async (newUserId: string) => {
    const referrerId = referrerIdRef.current;
    if (!referrerId || referrerId === newUserId) return;
    const { error } = await supabase
      .from('referrals')
      .insert({ invited_by: referrerId, invited_user: newUserId, credits_awarded: 100 })
      .select()
      .single();
    if (error) return;
    await supabase.rpc('add_to_wallet', { p_user_id: referrerId, p_amount: 100 }).catch(() => {});
    await supabase.rpc('add_to_wallet', { p_user_id: newUserId, p_amount: 100 }).catch(() => {});
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await authService.verifyOtpAndSetPassword(email, otp, password);
      recordReferral(user.id).catch(() => {});
      login(authService.mapUser(user));
      navigate('/');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
    }
  };

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
        </div>

        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-14" />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-14" />
            <Button type="submit" className="w-full h-12 rounded-full" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign in'}
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
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-14" />
            <Button type="submit" className="w-full h-12 rounded-full" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continue'}
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
            <p className="text-muted-foreground text-center">Enter the 4-digit code sent to {email}</p>
            <Input type="text" placeholder="Verification code" value={otp} onChange={(e) => setOtp(e.target.value)} required maxLength={4} className="h-14 text-center text-2xl tracking-widest" />
            <Input type="password" placeholder="Create password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="h-14" />
            <Button type="submit" className="w-full h-12 rounded-full" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify and create account'}
            </Button>
            <div className="text-center">
              <button type="button" onClick={handleSendOtp} className="text-primary hover:underline text-sm" disabled={loading}>
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
