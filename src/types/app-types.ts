// Shared application contracts. Keep authentication fields optional where they
// are populated asynchronously from the profile/session pipeline.
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatar?: string;
  creator_tier?: string;
  is_creator?: boolean;
  verified?: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatar_url?: string;
  bio?: string;
  verified: boolean;
  followers_count: number;
  following_count: number;
  created_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url?: string;
  video_url?: string;
  is_video: boolean;
  is_long_form?: boolean;
  is_monetized?: boolean;
  price?: number;
  community_id?: string;
  media_urls?: string[];
  media_count?: number;
  views_count: number;
  likes_count: number;
  reposts_count: number;
  replies_count: number;
  created_at: string;
  edited_at?: string;
  edit_history?: any[];
  user_profiles: UserProfile;
  is_boosted?: boolean;
  boost_type?: string;
}

export interface TrendingTopic {
  id: string;
  topic: string;
  category: string;
  posts_count: number;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'like' | 'repost' | 'follow' | 'reply' | 'mention' | 'verified' | 'activity';
  from_user_id?: string;
  post_id?: string;
  created_at?: string;
}
