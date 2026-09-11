-- Atomic, server-authoritative engagement toggles.
-- Unique indexes make retries and concurrent clicks idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS likes_user_post_unique ON public.likes(user_id, post_id);
CREATE UNIQUE INDEX IF NOT EXISTS reposts_user_post_unique ON public.reposts(user_id, post_id);

CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id uuid)
RETURNS TABLE(is_liked boolean, likes_count bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.likes WHERE user_id = uid AND post_id = p_post_id) THEN
    DELETE FROM public.likes WHERE user_id = uid AND post_id = p_post_id;
  ELSE
    INSERT INTO public.likes(user_id, post_id) VALUES (uid, p_post_id) ON CONFLICT (user_id, post_id) DO NOTHING;
  END IF;
  UPDATE public.posts SET likes_count = (SELECT count(*) FROM public.likes WHERE post_id = p_post_id) WHERE id = p_post_id;
  RETURN QUERY SELECT EXISTS (SELECT 1 FROM public.likes WHERE user_id = uid AND post_id = p_post_id), (SELECT count(*) FROM public.likes WHERE post_id = p_post_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_post_repost(p_post_id uuid)
RETURNS TABLE(is_reposted boolean, reposts_count bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.reposts WHERE user_id = uid AND post_id = p_post_id) THEN
    DELETE FROM public.reposts WHERE user_id = uid AND post_id = p_post_id;
  ELSE
    INSERT INTO public.reposts(user_id, post_id) VALUES (uid, p_post_id) ON CONFLICT (user_id, post_id) DO NOTHING;
  END IF;
  UPDATE public.posts SET reposts_count = (SELECT count(*) FROM public.reposts WHERE post_id = p_post_id) WHERE id = p_post_id;
  RETURN QUERY SELECT EXISTS (SELECT 1 FROM public.reposts WHERE user_id = uid AND post_id = p_post_id), (SELECT count(*) FROM public.reposts WHERE post_id = p_post_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_post_like(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_post_repost(uuid) TO authenticated;
