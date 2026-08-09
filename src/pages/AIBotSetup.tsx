import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Bot, Loader2, CheckCircle, XCircle, Radio } from 'lucide-react';

export default function AIBotSetup() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const triggerAIBot = async () => {
    setLoading(true);
    setStatus('idle');

    try {
      const { data, error } = await supabase.functions.invoke('ai-news-bot', {
        body: {},
      });

      if (error) throw error;

      setStatus('success');
      toast({
        title: 'Success!',
        description: 'AI News Bot posted a new article',
      });

      console.log('AI Bot response:', data);
    } catch (error: any) {
      console.error('Error triggering AI bot:', error);
      setStatus('error');
      toast({
        title: 'Error',
        description: error.message || 'Failed to trigger AI bot',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="AI News Bot" showBack />

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl p-8 border border-purple-500/20">
          <div className="flex items-start space-x-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2">AI News Bot</h2>
              <p className="text-muted-foreground mb-4">
                Automated AI-powered news bot that fetches and posts breaking news, trending topics, 
                and verified information 20 times per day (every hour).
              </p>
              <div className="flex items-center space-x-2 text-sm">
                <Radio className="w-4 h-4 text-green-500" />
                <span className="text-green-500 font-semibold">Active</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-muted/50 rounded-xl p-6 space-y-4">
          <h3 className="font-bold text-lg">How it works</h3>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Fetches news from News API (or demo data if API key not configured)</span>
            </li>
            <li className="flex items-start space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Creates engaging posts with news titles, descriptions, and links</span>
            </li>
            <li className="flex items-start space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Automatically tagged with relevant hashtags</span>
            </li>
            <li className="flex items-start space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Verified badge for trusted news source</span>
            </li>
          </ul>
        </div>

        <div className="bg-muted/50 rounded-xl p-6 space-y-4">
          <h3 className="font-bold text-lg">Setup Instructions</h3>
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-background rounded-lg">
              <p className="font-semibold mb-2">1. Configure News API (Optional)</p>
              <p className="text-muted-foreground">
                Add your News API key to Edge Function secrets:
              </p>
              <code className="block mt-2 p-2 bg-muted rounded text-xs">
                NEWS_API_KEY=your_api_key_here
              </code>
              <p className="text-muted-foreground text-xs mt-2">
                Get a free API key from <a href="https://newsapi.org" target="_blank" className="text-primary hover:underline">newsapi.org</a>
              </p>
            </div>

            <div className="p-4 bg-background rounded-lg">
              <p className="font-semibold mb-2">2. Schedule Automated Posts</p>
              <p className="text-muted-foreground">
                Use a CRON service to trigger the bot every hour:
              </p>
              <code className="block mt-2 p-2 bg-muted rounded text-xs break-all">
                {SUPABASE_URL}/functions/v1/ai-news-bot
              </code>
              <p className="text-muted-foreground text-xs mt-2">
                Recommended: <a href="https://cron-job.org" target="_blank" className="text-primary hover:underline">cron-job.org</a> or GitHub Actions
              </p>
            </div>

            <div className="p-4 bg-background rounded-lg">
              <p className="font-semibold mb-2">3. Manual Trigger (Testing)</p>
              <p className="text-muted-foreground mb-3">
                Click the button below to manually trigger a news post for testing:
              </p>
              <Button
                onClick={triggerAIBot}
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Fetching news...
                  </>
                ) : (
                  <>
                    <Bot className="w-4 h-4 mr-2" />
                    Trigger News Post Now
                  </>
                )}
              </Button>
              {status === 'success' && (
                <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center space-x-2 text-green-500">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-semibold">News post created successfully!</span>
                </div>
              )}
              {status === 'error' && (
                <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center space-x-2 text-destructive">
                  <XCircle className="w-5 h-5" />
                  <span className="text-sm font-semibold">Failed to create post. Check console for details.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
          <h3 className="font-bold text-sm mb-2 flex items-center text-yellow-600 dark:text-yellow-500">
            <Bot className="w-4 h-4 mr-2" />
            Important Notes
          </h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• The AI bot user is automatically created on first run</li>
            <li>• Posts are created with verified badge</li>
            <li>• If NEWS_API_KEY is not set, demo data will be used</li>
            <li>• For 20 posts per day, schedule CRON to run every hour (0 */1 * * *)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
