import { useState, useEffect, useCallback, useRef } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { CommunitySpacesHubNav } from '@/components/features/CommunitySpacesHubNav';
import { supabase } from '@/lib/supabase';
import { Space } from '@/types/app-types';
import {
  Radio, Users, Mic, Loader2, Headphones, Video, Settings, BadgeCheck,
  Lock, Play, Clock, Hash, Rss, Search, Bell, BellOff, Copy, Share2,
  CalendarDays, ChevronDown, Check, TrendingUp, Bookmark, Star,
  Plus, ListMusic, X, Trash2, Scissors, Timer, DollarSign,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow, intervalToDuration, format, isPast } from 'date-fns';
import { formatNumber } from '@/lib/utils';
import { StartSpaceDialog } from '@/components/features/StartSpaceDialog';
import { JoinSpaceDialog } from '@/components/features/JoinSpaceDialog';
import { ManageSpaceDialog } from '@/components/features/ManageSpaceDialog';
import { toast } from 'sonner';
import { useSEO } from '@/hooks/useSEO';
import { PageAdBanner } from '@/components/features/AdSenseAd';

// Communities/Spaces share one navigation surface; creation stays inside the real Spaces page.
function SpacesAdBanner() { return <PageAdBanner />; }
