import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { 
  Link, 
  Copy, 
  Check,
  Twitter,
  Linkedin,
  MessageCircle,
  Share2,
  QrCode
} from 'lucide-react';
import { Post } from '@/types/app-types';
import { buildOgImageUrl } from '@/hooks/useSEO';

interface SharePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: Post;
}

export function SharePostDialog({ open, onOpenChange, post }: SharePostDialogProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Build URL lazily inside callbacks — avoids window.location at render scope (esbuild non-determinism)
  const getShareUrl = () => `${window.location.origin}/post/${post.id}`;
  // Use a stable string for display — just the path, not origin
  const shareUrlDisplay = `/post/${post.id}`;
  const rawText = (post.content ?? '').replace(/<[^>]*>/g, '');
  const shareText = `${rawText.substring(0, 100)}${rawText.length > 100 ? '...' : ''}`;
  const ogImageUrl = buildOgImageUrl({ post: post.id });

  // Inject OG meta tags so crawlers and messaging apps see the dynamic post card
  useEffect(() => {
    if (!open) return;
    const shareUrl = getShareUrl();
    const setM = (p: string, c: string) => {
      let el = document.querySelector(`meta[property="${p}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', p); document.head.appendChild(el); }
      el.setAttribute('content', c);
    };
    const setN = (n: string, c: string) => {
      let el = document.querySelector(`meta[name="${n}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement('meta'); el.setAttribute('name', n); document.head.appendChild(el); }
      el.setAttribute('content', c);
    };
    const title = shareText || 'Post on Testagram';
    setM('og:title', title);
    setM('og:description', shareText || 'Read this post on Testagram');
    setM('og:image', ogImageUrl);
    setM('og:image:width', '1200');
    setM('og:image:height', '630');
    setM('og:url', shareUrl);
    setM('og:type', 'article');
    setN('twitter:card', 'summary_large_image');
    setN('twitter:image', ogImageUrl);
    setN('twitter:title', title);
    setN('twitter:description', shareText);
  }, [open, ogImageUrl, shareText]);

  const copyToClipboard = async () => {
    const shareUrl = getShareUrl();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({
        title: 'Link copied!',
        description: 'Share link copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy link',
        variant: 'destructive',
      });
    }
  };

  const shareToTwitter = () => {
    const shareUrl = getShareUrl();
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank');
  };

  const shareToFacebook = () => {
    const shareUrl = getShareUrl();
    // Facebook reads og:image from the page — our injected meta tag handles this
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank');
  };

  const shareToLinkedIn = () => {
    const shareUrl = getShareUrl();
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank');
  };

  const shareToWhatsApp = () => {
    const shareUrl = getShareUrl();
    const url = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`;
    window.open(url, '_blank');
  };

  const shareViaNative = async () => {
    if (navigator.share) {
      const shareUrl = getShareUrl();
      try {
        await navigator.share({
          title: 'Share post',
          text: shareText,
          url: shareUrl,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Post</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Input
              readOnly
              value={shareUrlDisplay}
              className="flex-1"
            />
            <Button
              onClick={copyToClipboard}
              variant="outline"
              size="icon"
              className="flex-shrink-0"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* OG preview card — what will appear when link is shared */}
          {(post.image_url || post.video_url) && (
            <div className="rounded-xl overflow-hidden border border-border bg-muted/30">
              <img
                src={ogImageUrl}
                alt="Post preview"
                className="w-full h-40 object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={shareToTwitter}
              className="w-full"
            >
              <Twitter className="w-4 h-4 mr-2" />
              Twitter
            </Button>
            <Button
              variant="outline"
              onClick={shareToFacebook}
              className="w-full"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Facebook
            </Button>
            <Button
              variant="outline"
              onClick={shareToLinkedIn}
              className="w-full"
            >
              <Linkedin className="w-4 h-4 mr-2" />
              LinkedIn
            </Button>
            <Button
              variant="outline"
              onClick={shareToWhatsApp}
              className="w-full"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              WhatsApp
            </Button>
          </div>

          {navigator.share && (
            <Button
              onClick={shareViaNative}
              variant="default"
              className="w-full"
            >
              <Link className="w-4 h-4 mr-2" />
              Share via...
            </Button>
          )}

          {/* QR badge */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded-xl">
            <QrCode className="w-3.5 h-3.5 shrink-0" />
            <span>Dynamic preview card is generated for every social share</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
