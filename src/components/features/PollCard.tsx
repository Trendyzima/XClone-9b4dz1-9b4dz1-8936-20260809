import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface PollOption {
  id: string;
  option_text: string;
  votes: number;
}

interface Poll {
  id: string;
  question: string;
  expires_at: string;
  total_votes: number;
  options: PollOption[];
}

interface PollCardProps {
  poll: Poll;
  postId: string;
}

export function PollCard({ poll, postId }: PollCardProps) {
  const { user } = useAuth();
  const [voted, setVoted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [pollData, setPollData] = useState(poll);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkIfVoted();
  }, [poll.id, user]);

  const checkIfVoted = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('poll_votes')
      .select('option_id')
      .eq('poll_id', poll.id)
      .eq('user_id', user.id)
      .single();

    if (data) {
      setVoted(true);
      setSelectedOption(data.option_id);
    }
  };

  const handleVote = async (optionId: string) => {
    if (!user) {
      toast.error('Please log in to vote');
      return;
    }

    if (voted) {
      toast.error('You have already voted in this poll');
      return;
    }

    const now = new Date();
    const expiresAt = new Date(poll.expires_at);
    if (now > expiresAt) {
      toast.error('This poll has ended');
      return;
    }

    setLoading(true);

    try {
      // Insert vote
      const { error: voteError } = await supabase
        .from('poll_votes')
        .insert({
          poll_id: poll.id,
          option_id: optionId,
          user_id: user.id
        });

      if (voteError) throw voteError;

      // Update option votes
      const { error: optionError } = await supabase.rpc('increment', {
        table_name: 'poll_options',
        row_id: optionId,
        column_name: 'votes'
      });

      // Update total votes
      const { error: pollError } = await supabase.rpc('increment', {
        table_name: 'polls',
        row_id: poll.id,
        column_name: 'total_votes'
      });

      // Refresh poll data
      const { data: updatedPoll } = await supabase
        .from('polls')
        .select(`
          *,
          options:poll_options(*)
        `)
        .eq('id', poll.id)
        .single();

      if (updatedPoll) {
        setPollData(updatedPoll as Poll);
      }

      setVoted(true);
      setSelectedOption(optionId);
      toast.success('Vote recorded!');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getPercentage = (votes: number) => {
    if (pollData.total_votes === 0) return 0;
    return Math.round((votes / pollData.total_votes) * 100);
  };

  const isExpired = new Date() > new Date(poll.expires_at);
  const timeLeft = Math.max(0, new Date(poll.expires_at).getTime() - Date.now());
  const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
  const daysLeft = Math.floor(hoursLeft / 24);

  return (
    <div className="border border-border rounded-lg p-4 mt-3">
      <h3 className="font-semibold text-lg mb-3">{poll.question}</h3>
      
      <div className="space-y-2">
        {pollData.options.map((option) => {
          const percentage = getPercentage(option.votes);
          const isSelected = selectedOption === option.id;

          return (
            <button
              key={option.id}
              onClick={() => !voted && !isExpired && handleVote(option.id)}
              disabled={voted || isExpired || loading}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                voted || isExpired
                  ? 'cursor-default'
                  : 'cursor-pointer hover:bg-muted/50'
              } ${
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{option.option_text}</span>
                {(voted || isExpired) && (
                  <span className="text-sm font-semibold">{percentage}%</span>
                )}
              </div>
              
              {(voted || isExpired) && (
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      isSelected ? 'bg-primary' : 'bg-primary/60'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 text-sm text-muted-foreground">
        {pollData.total_votes} vote{pollData.total_votes !== 1 ? 's' : ''} · {' '}
        {isExpired ? (
          <span>Poll ended</span>
        ) : daysLeft > 0 ? (
          <span>{daysLeft} day{daysLeft !== 1 ? 's' : ''} left</span>
        ) : hoursLeft > 0 ? (
          <span>{hoursLeft} hour{hoursLeft !== 1 ? 's' : ''} left</span>
        ) : (
          <span>Less than an hour left</span>
        )}
      </div>
    </div>
  );
}
