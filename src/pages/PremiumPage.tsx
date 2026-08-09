import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { Crown, Check, Loader2, BadgeCheck, Zap, Star, Shield } from 'lucide-react';
import { toast } from 'sonner';

const VERIFICATION_TIERS = [
  {
    name: 'Basic',
    price: 4.99,
    color: 'from-blue-500 to-cyan-500',
    icon: BadgeCheck,
    features: [
      'White checkmark verification badge',
      'Priority support',
      'Increased visibility',
      'Remove ads',
      'Access to premium features',
    ],
  },
  {
    name: 'Premium',
    price: 9.99,
    color: 'from-purple-500 to-pink-500',
    icon: Crown,
    popular: true,
    features: [
      'All Basic features',
      'Gold verification badge',
      'Advanced analytics',
      'Video uploads up to 50MB',
      'Monetization enabled',
      'Custom profile themes',
      'Exclusive badges',
    ],
  },
  {
    name: 'VIP',
    price: 19.99,
    color: 'from-yellow-500 to-orange-500',
    icon: Star,
    features: [
      'All Premium features',
      'Diamond verification badge',
      'Priority in recommendations',
      'Unlimited video uploads',
      'Revenue share program',
      'Direct support line',
      'Early access to features',
      'VIP-only events',
    ],
  },
];

export default function PremiumPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [existingRequest, setExistingRequest] = useState<any>(null);

  useEffect(() => {
    if (user) {
      checkExistingRequest();
    }
  }, [user]);

  const checkExistingRequest = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('verification_requests')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();

      setExistingRequest(data);
    } catch (error) {
      console.error('Error checking verification request:', error);
    }
  };

  const handleRequestVerification = async (tier: string, price: number) => {
    if (!user) {
      navigate('/auth');
      return;
    }

    setLoading(true);
    setSelectedTier(tier);

    try {
      // Create verification request
      const { error } = await supabase.from('verification_requests').insert({
        user_id: user.id,
        tier: tier.toLowerCase(),
        payment_amount: price,
        payment_status: 'pending',
        status: 'pending',
      });

      if (error) throw error;

      toast.success('Verification request submitted! Admin will review your application.');
      checkExistingRequest();
    } catch (error: any) {
      console.error('Error requesting verification:', error);
      toast.error(error.message || 'Failed to submit request');
    } finally {
      setLoading(false);
      setSelectedTier(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Crown className="w-16 h-16 mx-auto mb-4 text-primary" />
          <h2 className="text-2xl font-bold mb-2">Get Verified</h2>
          <p className="text-muted-foreground mb-6">Sign in to upgrade your account</p>
          <Button onClick={() => navigate('/auth')} size="lg" className="rounded-full">
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <TopBar title="Get Verified" showBack />

      <div className="max-w-6xl mx-auto p-4 md:p-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mb-4">
            <Crown className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-4">Get Verified on T Social</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Stand out with a verification badge, unlock premium features, and monetize your content
          </p>
        </div>

        {/* Existing Request Notice */}
        {existingRequest && (
          <div className="mb-8 p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="flex items-start gap-3">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-blue-900 dark:text-blue-100 mb-1">
                  Verification Request Pending
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Your {existingRequest.tier} tier verification request is being reviewed by our team. 
                  You'll be notified once it's processed.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pricing Tiers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {VERIFICATION_TIERS.map((tier) => {
            const Icon = tier.icon;
            return (
              <div
                key={tier.name}
                className={`relative rounded-2xl border-2 p-6 ${
                  tier.popular
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-background'
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <div className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-bold">
                      MOST POPULAR
                    </div>
                  </div>
                )}

                <div className="text-center mb-6">
                  <div className={`inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br ${tier.color} rounded-full mb-4`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">{tier.name}</h3>
                  <div className="mb-4">
                    <span className="text-4xl font-bold">${tier.price}</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleRequestVerification(tier.name, tier.price)}
                  disabled={loading || !!existingRequest}
                  className={`w-full rounded-full ${
                    tier.popular
                      ? `bg-gradient-to-r ${tier.color} hover:opacity-90`
                      : ''
                  }`}
                  variant={tier.popular ? 'default' : 'outline'}
                  size="lg"
                >
                  {loading && selectedTier === tier.name ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : existingRequest ? (
                    'Pending Approval'
                  ) : (
                    `Get ${tier.name}`
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Benefits Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-xl p-6">
            <BadgeCheck className="w-12 h-12 text-blue-500 mb-4" />
            <h3 className="font-bold text-lg mb-2">Stand Out</h3>
            <p className="text-sm text-muted-foreground">
              Get a verified badge with a white checkmark that shows your authenticity
            </p>
          </div>

          <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-6">
            <Zap className="w-12 h-12 text-purple-500 mb-4" />
            <h3 className="font-bold text-lg mb-2">Unlock Features</h3>
            <p className="text-sm text-muted-foreground">
              Access premium tools, analytics, and content creation features
            </p>
          </div>

          <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-6">
            <Shield className="w-12 h-12 text-green-500 mb-4" />
            <h3 className="font-bold text-lg mb-2">Monetize</h3>
            <p className="text-sm text-muted-foreground">
              Enable monetization and earn revenue from your content
            </p>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-center">Frequently Asked Questions</h2>
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="font-semibold mb-2">How does verification work?</h4>
              <p className="text-sm text-muted-foreground">
                After selecting a tier and submitting your request, our admin team reviews your application. 
                Once approved, you'll receive your verification badge and all tier benefits.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="font-semibold mb-2">What's the difference between tiers?</h4>
              <p className="text-sm text-muted-foreground">
                Each tier includes all features from previous tiers plus additional benefits. 
                Higher tiers get better badges (white → gold → diamond), more storage, and enhanced monetization.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="font-semibold mb-2">Can I cancel anytime?</h4>
              <p className="text-sm text-muted-foreground">
                Yes, you can cancel your verification subscription at any time. 
                You'll keep your benefits until the end of your current billing period.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
