import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { TrendingUp, Target, Calendar, DollarSign } from 'lucide-react';
import { PaymentDialog } from './PaymentDialog';
import { useToast } from '@/hooks/use-toast';

interface BoostPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
}

export function BoostPostDialog({ open, onOpenChange, postId }: BoostPostDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [budget, setBudget] = useState(10);
  const [duration, setDuration] = useState(7); // days
  const [showPayment, setShowPayment] = useState(false);
  const [targetAudience, setTargetAudience] = useState({
    age_min: 18,
    age_max: 65,
    interests: [] as string[],
  });

  const estimatedReach = Math.floor(budget * 100 * duration);

  const handleBoost = () => {
    setShowPayment(true);
  };

  const handlePaymentSuccess = async () => {
    if (!user) return;

    try {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + duration);

      const { error } = await supabase.from('boosted_posts').insert({
        post_id: postId,
        user_id: user.id,
        boost_type: 'promoted',
        budget,
        target_audience: targetAudience,
        end_date: endDate.toISOString(),
        is_active: true,
      });

      if (error) throw error;

      toast({
        title: 'Post Boosted!',
        description: `Your post will reach ${estimatedReach.toLocaleString()} more people`,
      });

      onOpenChange(false);
    } catch (error: any) {
      console.error('Boost error:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Boost Your Post
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Budget */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Daily Budget
                </Label>
                <span className="text-2xl font-bold">${budget}</span>
              </div>
              <Slider
                value={[budget]}
                onValueChange={(value) => setBudget(value[0])}
                min={5}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                Spend ${budget} per day to reach more people
              </p>
            </div>

            {/* Duration */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Duration
                </Label>
                <span className="text-2xl font-bold">{duration} days</span>
              </div>
              <Slider
                value={[duration]}
                onValueChange={(value) => setDuration(value[0])}
                min={1}
                max={30}
                step={1}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                Run your campaign for {duration} day{duration !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Estimated Reach */}
            <div className="bg-primary/10 p-4 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Target className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Estimated Reach</h3>
              </div>
              <p className="text-3xl font-bold mb-1">
                {estimatedReach.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">
                Additional people who will see your post
              </p>
            </div>

            {/* Total Cost */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-4">
                <span className="font-semibold">Total Cost</span>
                <span className="text-2xl font-bold">
                  ${(budget * duration).toFixed(2)}
                </span>
              </div>

              <Button onClick={handleBoost} className="w-full" size="lg">
                Continue to Payment
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Your post will be marked as "Sponsored" and shown to more users
              based on their interests and activity.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <PaymentDialog
        open={showPayment}
        onOpenChange={setShowPayment}
        amount={budget * duration}
        type="boost_post"
        metadata={{
          post_id: postId,
          budget,
          duration,
          target_audience: targetAudience,
        }}
        onSuccess={handlePaymentSuccess}
      />
    </>
  );
}
