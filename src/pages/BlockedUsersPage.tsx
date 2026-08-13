import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSEO } from '@/hooks/useSEO';
import { TopBar } from '@/components/layout/TopBar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Shield, Loader2, UserX, User } from 'lucide-react';

// esbuild guard: module-level helper — no inline string ops in JSX
function formatHandle(username: string): string {
  return username ? `@${username}` : '@unknown';
}

export default function BlockedUsersPage() {
  useSEO({ noindex: true, title: 'Blocked & Muted Users', url: '/blocked' });
  const navigate = useNavigate();
  const { user } = useAuth();

  // Parallel arrays — esbuild guard: no typed interface array state
  const [blockIds, setBlockIds] = useState([]);
  const [blockedUsernames, setBlockedUsernames] = useState([]);
  const [blockedAvatars, setBlockedAvatars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState('');

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    supabase
      .from('user_blocks')
      .select('id, user_profiles!user_blocks_blocked_id_fkey(username, avatar_url)')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) { setLoading(false); return; }
        const ids: string[] = [];
        const unames: string[] = [];
        const avatars: string[] = [];
        for (let i = 0; i < data.length; i++) {
          const row = data[i] as any;
          ids.push(row.id);
          unames.push(row.user_profiles?.username ?? 'unknown');
          avatars.push(row.user_profiles?.avatar_url ?? '');
        }
        setBlockIds(ids as any);
        setBlockedUsernames(unames as any);
        setBlockedAvatars(avatars as any);
        setLoading(false);
      });
  }, [user?.id]);

  const handleUnblock = async (blockId: string, username: string, idx: number) => {
    setUnblockingId(blockId);
    const { error } = await supabase.from('user_blocks').delete().eq('id', blockId);
    setUnblockingId('');
    if (error) { toast.error(error.message || 'Failed to unblock'); return; }
    // Remove from parallel arrays
    const ids = [...(blockIds as string[])];
    const unames = [...(blockedUsernames as string[])];
    const avs = [...(blockedAvatars as string[])];
    ids.splice(idx, 1);
    unames.splice(idx, 1);
    avs.splice(idx, 1);
    setBlockIds(ids as any);
    setBlockedUsernames(unames as any);
    setBlockedAvatars(avs as any);
    toast.success(`@${username} unblocked`);
  };

  if (!user) return null;

  const bIds = blockIds as string[];
  const bUnames = blockedUsernames as string[];
  const bAvatars = blockedAvatars as string[];
  const hasBlocked = bIds.length > 0;
  const countLabel = bIds.length !== 1 ? `${bIds.length} blocked users` : '1 blocked user';

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <TopBar title="Blocked & Muted Users" showBack />

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Info banner */}
        <div className="flex items-start gap-3 p-4 bg-muted/40 border border-border rounded-2xl">
          <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold">Blocked users</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Blocked users cannot see your posts, follow you, or send you messages. You can unblock them at any time.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading blocked users…</span>
          </div>
        ) : !hasBlocked ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
              <UserX className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <p className="font-bold text-base">No blocked users</p>
            <p className="text-sm text-muted-foreground">Users you block will appear here.</p>
          </div>
        ) : (
          <div className="border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-muted/20 border-b border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{countLabel}</p>
            </div>
            {bIds.map((blockId, i) => {
              const uname = bUnames[i];
              const avatar = bAvatars[i];
              const isUnblocking = unblockingId === blockId;
              const handle = formatHandle(uname);
              return (
                <div
                  key={blockId}
                  className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                    {avatar ? (
                      <img src={avatar} alt={uname} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{handle}</p>
                    <p className="text-xs text-muted-foreground">Blocked</p>
                  </div>
                  {/* Unblock button */}
                  <button
                    onClick={() => handleUnblock(blockId, uname, i)}
                    disabled={isUnblocking}
                    className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                  >
                    {isUnblocking && <Loader2 className="w-3 h-3 animate-spin" />}
                    Unblock
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Tip */}
        <p className="text-center text-xs text-muted-foreground px-4">
          To block a user, visit their profile and tap the ··· menu.
        </p>
      </div>
    </div>
  );
}
