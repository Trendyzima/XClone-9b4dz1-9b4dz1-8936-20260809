import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSEO } from '@/hooks/useSEO';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Megaphone, Image as ImageIcon, Loader2, CheckCircle2,
  Eye, TrendingUp, Clock, X, Info, CalendarClock, Zap
} from 'lucide-react';
import { toast } from 'sonner';

const MIN_BUDGET_KES = 500; // KES 500 minimum

export default function CreateAdPage() {
  useSEO({ noindex: true, title: 'Create Advertisement', url: '/create-ad' });
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'mpesa' | 'success'>('form');
  const [title, setTitle] = useState(searchParams.get('title') ?? '');
  const [description, setDescription] = useState(searchParams.get('desc') ?? '');
  const [targetUrl, setTargetUrl] = useState('');
  const [budgetKes, setBudgetKes] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Pre-fill image + source post from URL params (Boost as Ad flow)
  const fromPostId = searchParams.get('from_post');
  useEffect(() => {
    const imgParam = searchParams.get('img');
    if (imgParam) {
      try { setImagePreview(decodeURIComponent(imgParam)); } catch { /* ignore */ }
    }
  }, []);
  const [phone, setPhone] = useState('');
  const [adId, setAdId] = useState<string | null>(null);
  const [stkLoading, setStkLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'checking' | 'paid'>('pending');
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  // Ad scheduling
  const [enableSchedule, setEnableSchedule] = useState(false);
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');
  // Campaign duration preset
  const [durationDays, setDurationDays] = useState(30);
  // Target audience interests
  const [targetInterests, setTargetInterests] = useState<string[]>([]);
  const INTEREST_OPTIONS = ['Tech', 'Fashion', 'Food', 'Travel', 'Sports', 'Music', 'Business', 'Art', 'Gaming', 'Health', 'Education', 'Finance'];

  useEffect(() => {
    if (!user) navigate('/auth');
  }, [user]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  /** Step 1: Create ad record in DB, then proceed to M-Pesa payment */
  const handleSubmitAd = async () => {
    if (!title.trim() || !description.trim() || !budgetKes || parseFloat(budgetKes) < MIN_BUDGET_KES) {
      toast.error(`Please fill all fields. Minimum budget is KES ${MIN_BUDGET_KES}.`);
      return;
    }
    setLoading(true);
    try {
      let imageUrl: string | null = null;
      if (image) {
        const ext = image.name.split('.').pop();
        const fileName = `ads/${user!.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('posts').upload(fileName, image);
        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(fileName);
          imageUrl = publicUrl;
        }
      }

      // Build start/end dates
      const adStartDate = enableSchedule && scheduleStart ? new Date(scheduleStart).toISOString() : null;
      const adEndDate = enableSchedule && scheduleEnd
        ? new Date(scheduleEnd).toISOString()
        : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

      // Create ad with status=pending, payment_status=pending
      const { data: adData, error: adError } = await supabase
        .from('user_ads')
        .insert({
          user_id: user!.id,
          title: title.trim(),
          description: description.trim(),
          image_url: imageUrl,
          target_url: targetUrl.trim() || null,
          budget: parseFloat(budgetKes),
          payment_method: 'mpesa',
          payment_status: 'pending',
          status: 'pending',
          start_date: adStartDate,
          end_date: adEndDate,
          target_audience: targetInterests.length > 0 ? { interests: targetInterests } : {},
        })
        .select()
        .single();

      if (adError) throw adError;
      setAdId(adData.id);

      // ── Background AI content moderation — fire and forget ──────────────────
      // Do NOT await — runs in background without blocking user flow
      supabase.functions.invoke('ai-moderation', {
        body: { ad_id: adData.id, ad_title: title.trim(), ad_description: description.trim(), ad_image_url: imageUrl ?? null },
      }).then(({ data: aiData }) => {
        // AI result processed server-side — just log for debugging
        console.log('Ad AI check:', aiData?.action, 'score:', aiData?.overall_score);
      }).catch(() => { /* non-critical — regulator still sees the ad */ });

      // Notify all admins of the new pending ad (supplement DB trigger)
      try {
        const { data: adminRows } = await supabase.from('admin_users').select('user_id');
        if (adminRows && adminRows.length > 0) {
          const notifInserts = adminRows
            .filter((a: any) => a.user_id !== user!.id)
            .map((a: any) => ({ user_id: a.user_id, type: 'new_ad', from_user_id: user!.id }));
          if (notifInserts.length > 0) {
            await supabase.from('notifications').insert(notifInserts);
          }
        }
      } catch (_) { /* non-critical */ }

      setStep('mpesa');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create ad');
    } finally {
      setLoading(false);
    }
  };

  /** Step 2: Trigger M-Pesa STK Push */
  const handleMpesaPay = async () => {
    if (!phone.trim() || !adId) return;
    const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '254').replace(/^254254/, '254');
    if (cleanPhone.length !== 12) {
      toast.error('Enter a valid Kenyan phone number e.g. 0712345678');
      return;
    }

    setStkLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
        body: {
          phone: cleanPhone,
          amount: Math.ceil(parseFloat(budgetKes)),
          reference: `AD-${adId?.slice(0, 8).toUpperCase()}`,
          description: `Payment for ad: ${title.slice(0, 40)}`,
          metadata: { adId },
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.CheckoutRequestID) throw new Error('STK push failed');

      setCheckoutRequestId(data.CheckoutRequestID);
      toast.success('M-Pesa prompt sent! Check your phone and enter your PIN.');
      pollPaymentStatus(data.CheckoutRequestID, adId!);
    } catch (error: any) {
      toast.error(error.message || 'Failed to initiate M-Pesa payment');
    } finally {
      setStkLoading(false);
    }
  };

  /** Poll M-Pesa payment status every 5s for up to 2 minutes */
  const pollPaymentStatus = async (checkoutId: string, adIdParam: string) => {
    setPaymentStatus('checking');
    let attempts = 0;
    const maxAttempts = 24; // 2 minutes

    const poll = async () => {
      try {
        // Check mpesa_transactions table for completion
        const { data: txn } = await supabase
          .from('mpesa_transactions')
          .select('status, result_code')
          .eq('checkout_request_id', checkoutId)
          .maybeSingle();

        if (txn?.status === 'completed' && txn.result_code === '0') {
          // Payment confirmed — auto-activate ad
          await supabase.from('user_ads').update({
            payment_status: 'paid',
            status: 'active',
            payment_reference: checkoutId,
            start_date: new Date().toISOString(),
            end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
          }).eq('id', adIdParam);

          // Auto AI verification
          await supabase.rpc('auto_verify_ad', { ad_id_param: adIdParam });

          setPaymentStatus('paid');
          setStep('success');
          toast.success('🎉 Payment confirmed! Your ad is now live.');
          return;
        }

        if (txn?.status === 'failed') {
          setPaymentStatus('pending');
          toast.error('Payment failed. Please try again.');
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000);
        } else {
          setPaymentStatus('pending');
          toast.error('Payment timeout. If you paid, it will be verified shortly.');
        }
      } catch (e) {
        attempts++;
        if (attempts < maxAttempts) setTimeout(poll, 5000);
      }
    };

    setTimeout(poll, 5000);
  };

  if (!user) return null;

  // ── Success screen ────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 text-center">
        <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-14 h-14 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Ad is Live! 🎉</h2>
        <p className="text-muted-foreground mb-2">Your advertisement has been approved and is now reaching users.</p>
        <p className="text-sm text-muted-foreground mb-8">Budget: KES {budgetKes} · Estimated {Math.floor(parseFloat(budgetKes) / 0.5).toLocaleString()} impressions</p>
        <div className="flex gap-3">
          <Button onClick={() => navigate('/my-ads')} className="rounded-full px-6">
            View My Ads
          </Button>
          <Button variant="outline" onClick={() => navigate('/')} className="rounded-full px-6">
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  // ── M-Pesa Payment screen ─────────────────────────────────────────
  if (step === 'mpesa') {
    return (
      <div className="min-h-screen bg-background pb-16 md:pb-0">
        <TopBar title="Pay via M-Pesa" showBack />
        <div className="max-w-md mx-auto p-6 space-y-6">
          {/* Summary */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-green-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xl font-black">M</span>
              </div>
              <div>
                <h3 className="font-bold text-lg">M-Pesa Payment</h3>
                <p className="text-sm text-muted-foreground">Pay for your advertisement</p>
                <p className="text-2xl font-black text-green-600 mt-1">KES {parseFloat(budgetKes).toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ad Title</span>
              <span className="font-medium truncate max-w-[200px]">{title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Budget</span>
              <span className="font-bold text-primary">KES {parseFloat(budgetKes).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Est. Impressions</span>
              <span className="font-medium">{Math.floor(parseFloat(budgetKes) / 0.5).toLocaleString()}</span>
            </div>
          </div>

          {paymentStatus === 'checking' ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
              <p className="font-semibold">Waiting for payment confirmation...</p>
              <p className="text-sm text-muted-foreground mt-2">Enter your M-Pesa PIN on your phone.</p>
              <p className="text-xs text-muted-foreground mt-1">Your ad will activate automatically once paid.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-semibold mb-2">Your M-Pesa Phone Number *</label>
                <Input
                  type="tel"
                  placeholder="07XX XXX XXX"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="text-lg"
                />
                <p className="text-xs text-muted-foreground mt-1">A payment request will be sent to this number.</p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                    <p><strong>How it works:</strong></p>
                    <p>1. Enter your phone number and tap "Pay Now"</p>
                    <p>2. An M-Pesa prompt appears on your phone</p>
                    <p>3. Enter your PIN to confirm payment</p>
                    <p>4. Your ad <strong>activates automatically</strong> once payment is confirmed!</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleMpesaPay}
                disabled={stkLoading || !phone.trim()}
                className="w-full py-6 text-lg bg-green-600 hover:bg-green-700 rounded-xl"
              >
                {stkLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Sending M-Pesa Request...</>
                ) : (
                  <>Pay KES {parseFloat(budgetKes || '0').toLocaleString()} via M-Pesa</>
                )}
              </Button>

              <button
                onClick={() => setStep('form')}
                className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
              >
                ← Back to Ad Details
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Ad creation form ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Create Advertisement" showBack />

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Boost as Ad banner — shown when launched from PostCard */}
        {fromPostId && (
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
            <div className="w-9 h-9 bg-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Boosting your post as an ad</p>
              <p className="text-xs text-amber-600 dark:text-amber-500">Content and image pre-filled from your post. Adjust as needed below.</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/20 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-primary/20 rounded-xl">
              <Megaphone className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Promote Your Business</h2>
              <p className="text-sm text-muted-foreground">Reach thousands of active users</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 text-center">
            {[
              { icon: Eye, label: '10K+', sub: 'daily active users' },
              { icon: TrendingUp, label: '3×', sub: 'engagement boost' },
              { icon: Clock, label: '1 hr', sub: 'to go live' },
            ].map((s, i) => (
              <div key={i} className="bg-background/60 rounded-xl p-2">
                <s.icon className="w-4 h-4 text-primary mx-auto mb-1" />
                <p className="font-bold text-sm">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-2">Ad Title *</label>
            <Input placeholder="Enter a catchy title..." value={title} onChange={e => setTitle(e.target.value)} maxLength={100} />
            <p className="text-xs text-muted-foreground mt-1">{title.length}/100</p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Description *</label>
            <Textarea
              placeholder="Describe what you're promoting..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="min-h-[120px]"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1">{description.length}/500</p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Target URL (optional)</label>
            <Input type="url" placeholder="https://example.com" value={targetUrl} onChange={e => setTargetUrl(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Ad Image (optional)</label>
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-border">
                <img src={imagePreview} alt="Ad preview" className="w-full max-h-64 object-cover" />
                <button
                  onClick={() => { setImage(null); setImagePreview(null); }}
                  className="absolute top-2 right-2 bg-black/80 text-white rounded-full w-8 h-8 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                <ImageIcon className="w-10 h-10 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground font-medium">Click to upload image</span>
                <span className="text-xs text-muted-foreground mt-0.5">PNG, JPG up to 10MB</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </label>
            )}
          </div>

          {/* Campaign Duration */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold">Campaign Duration</label>
            <div className="grid grid-cols-4 gap-2">
              {[7, 14, 30, 60].map(d => (
                <button key={d} onClick={() => { setDurationDays(d); setEnableSchedule(false); }}
                  className={`py-2 rounded-xl border-2 text-sm font-semibold transition-all ${!enableSchedule && durationDays === d ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30'}`}>
                  {d}d
                </button>
              ))}
            </div>
            <button onClick={() => setEnableSchedule(v => !v)}
              className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-xl border-2 w-full transition-all ${enableSchedule ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30'}`}>
              <CalendarClock className="w-4 h-4" />
              Custom schedule {enableSchedule ? '(on)' : '(pick dates)'}
            </button>
            {enableSchedule && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Start date</label>
                  <input type="datetime-local" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">End date</label>
                  <input type="datetime-local" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)}
                    min={scheduleStart || new Date().toISOString().slice(0, 16)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            )}
          </div>

          {/* Target Audience Interests */}
          <div>
            <label className="block text-sm font-semibold mb-2">Target Audience (optional)</label>
            <p className="text-xs text-muted-foreground mb-2">Select interests to show your ad to relevant users</p>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map(interest => {
                const selected = targetInterests.includes(interest);
                return (
                  <button key={interest} onClick={() => setTargetInterests(prev =>
                    selected ? prev.filter(i => i !== interest) : [...prev, interest]
                  )}
                    className={`px-3 py-1.5 rounded-full text-sm border-2 font-medium transition-all ${selected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30'}`}>
                    {interest}
                  </button>
                );
              })}
            </div>
            {targetInterests.length > 0 && (
              <p className="text-xs text-primary mt-1.5 font-medium">{targetInterests.length} interest{targetInterests.length !== 1 ? 's' : ''} selected — your ad will be prioritized for matching users</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Ad Budget (KES) *</label>
            <Input
              type="number"
              placeholder={`Minimum KES ${MIN_BUDGET_KES}`}
              value={budgetKes}
              onChange={e => setBudgetKes(e.target.value)}
              min={MIN_BUDGET_KES}
              step="100"
            />
            {budgetKes && parseFloat(budgetKes) >= MIN_BUDGET_KES && (
              <div className="mt-2 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground space-y-1">
                <p>💡 Estimated {Math.floor(parseFloat(budgetKes) / 0.5).toLocaleString()} impressions</p>
                <p>📱 Paid via M-Pesa — auto-activates on payment</p>
                <p>🏃 Runs for approximately 30 days</p>
              </div>
            )}
          </div>

          {/* Payment info */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
                <span className="text-white text-sm font-black">M</span>
              </div>
              <p className="font-semibold text-sm">M-Pesa Payment</p>
            </div>
            <p className="text-xs text-green-700 dark:text-green-400">
              All payments are processed via M-Pesa. Your ad activates automatically once payment is confirmed — no waiting for manual review!
            </p>
          </div>

          <Button
            onClick={handleSubmitAd}
            disabled={loading || !title || !description || !budgetKes || parseFloat(budgetKes) < MIN_BUDGET_KES}
            className="w-full py-6 text-base rounded-xl"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Megaphone className="w-5 h-5 mr-2" />}
            Continue to M-Pesa Payment
          </Button>
        </div>
      </div>
    </div>
  );
}
