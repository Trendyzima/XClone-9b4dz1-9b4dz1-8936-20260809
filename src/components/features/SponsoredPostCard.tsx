import { useEffect } from 'react';
import { ExternalLink, BadgeCheck, DollarSign } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { parseContent } from '@/lib/utils';

interface SponsoredPostCardProps {
  post: any; // user_ads row with user_profiles joined
}

export function SponsoredPostCard({ post }: SponsoredPostCardProps) {
  // Track impression on mount
  useEffect(() => {
    supabase
      .from('user_ads')
      .update({ impressions: (post.impressions ?? 0) + 1 })
      .eq('id', post.id)
      .catch(() => {});
  }, [post.id]);

  const handleClick = async () => {
    await supabase
      .from('user_ads')
      .update({ clicks: (post.clicks ?? 0) + 1 })
      .eq('id', post.id)
      .catch(() => {});
    if (post.target_url) window.open(post.target_url, '_blank', 'noopener,noreferrer');
  };

  const advertiserName =
    post.user_profiles?.username ?? post.title?.split(' ')[0] ?? 'Advertiser';
  const displayText = post.description ?? post.title ?? '';

  return (
    <div
      className="border-b border-border p-4 bg-gradient-to-br from-blue-500/5 to-purple-500/5 hover:from-blue-500/10 hover:to-purple-500/10 transition-all cursor-pointer"
      onClick={handleClick}
    >
      {/* Sponsored Label */}
      <div className="flex items-center gap-2 mb-3">
        <div className="px-2 py-0.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold rounded">
          SPONSORED
        </div>
        <span className="text-xs text-muted-foreground">Promoted content</span>
      </div>

      <div className="flex space-x-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex-shrink-0 overflow-hidden flex items-center justify-center text-white font-bold">
          {post.user_profiles?.avatar_url ? (
            <img
              src={post.user_profiles.avatar_url}
              alt={advertiserName}
              className="w-full h-full object-cover"
            />
          ) : (
            advertiserName[0]?.toUpperCase()
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-1 min-w-0 mb-1">
            <span className="font-bold text-foreground truncate">{advertiserName}</span>
            {post.user_profiles?.verified && (
              <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" fill="currentColor" />
            )}
            <span className="text-muted-foreground text-sm flex-shrink-0">· Sponsored</span>
          </div>

          {post.title && (
            <h3 className="font-bold text-base mt-1 leading-snug">{post.title}</h3>
          )}

          {displayText && (
            <div
              className="post-content text-foreground mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: parseContent(displayText) }}
            />
          )}

          {post.image_url && (
            <div className="mt-3 rounded-2xl overflow-hidden">
              <img
                src={post.image_url}
                alt={post.title ?? 'Ad'}
                className="w-full max-h-96 object-cover"
              />
            </div>
          )}

          {post.video_url && (
            <div className="mt-3 rounded-2xl overflow-hidden bg-black max-h-[400px]">
              <video
                controls
                className="w-full h-full max-h-[400px] object-contain"
                playsInline
                preload="metadata"
              >
                <source src={post.video_url} type="video/mp4" />
              </video>
            </div>
          )}

          {/* Budget meter */}
          {post.budget > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="w-3 h-3 text-green-500" />
              <span className="font-mono">
                ${Number(post.spent ?? 0).toFixed(2)} / ${Number(post.budget).toFixed(2)} spent
              </span>
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${Math.min((Number(post.spent ?? 0) / Number(post.budget)) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

          {post.target_url && (
            <div className="mt-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-full transition-all text-sm">
                Learn More
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
