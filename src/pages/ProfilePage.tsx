import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BadgeCheck, Calendar, Check, Copy, ExternalLink, Heart, Image as ImageIcon, Link as LinkIcon, Loader2, MapPin, MoreHorizontal, Pencil, Share2, ShieldBan, UserPlus, UserRoundMinus, VolumeX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useSEO } from '@/hooks/useSEO';
import { ProductionEditProfileDialog } from '@/components/features/ProductionEditProfileDialog';
import { WalletCard } from '@/components/features/WalletCard';
import { WalletCard } from '@/components/features/WalletCard';
import { ProfileEnhancements } from '@/components/features/ProfileEnhancements';
import { toast } from 'sonner';

interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  website: string | null;
  location: string | null;
  social_links: Record<string, string>;
  verified_tier: string;
  follower_count: number;
  following_count: number;
  profile_views: number;
  protected_account: boolean;
  birth_date: string | null;
  created_at: string;
}