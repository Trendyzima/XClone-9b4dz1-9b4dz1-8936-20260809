-- Compatibility bridge for legacy client paths while the canonical schema remains post_likes/post_reposts.
-- Keeps existing production tables and triggers authoritative; no parallel engagement storage.

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS likes_count bigint NOT NULL DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS reposts_count bigint NOT NULL DEFAULT 0;

UPDATE public.posts p
SET likes_count = COALESCE(p.like_count, 0),
    reposts_count = COALESCE(p.repost_count, 0);

CREATE OR REPLACE FUNCTION public.sync_legacy_engagement_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.posts p
  SET likes_count = (SELECT count(*) FROM public.post_likes l WHERE l.post_id = COALESCE(NEW.post_id, OLD.post_id)),
      reposts_count = (SELECT count(*) FROM public.post_reposts r WHERE r.post_id = COALESCE(NEW.post_id, OLD.post_id))
  WHERE p.id = COALESCE(NEW.post_id, OLD.post_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_legacy_like_counts ON public.post_likes;
CREATE TRIGGER sync_legacy_like_counts
AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_engagement_counts();

DROP TRIGGER IF EXISTS sync_legacy_repost_counts ON public.post_reposts;
CREATE TRIGGER sync_legacy_repost_counts
AFTER INSERT OR DELETE ON public.post_reposts
FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_engagement_counts();

-- Legacy read/write views used by older client code.
CREATE OR REPLACE VIEW public.likes AS
SELECT id, user_id, post_id, created_at FROM public.post_likes;

CREATE OR REPLACE VIEW public.reposts AS
SELECT id, user_id, post_id, created_at FROM public.post_reposts;

CREATE OR REPLACE FUNCTION public.likes_view_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.post_likes(user_id, post_id) VALUES (NEW.user_id, NEW.post_id)
    ON CONFLICT (user_id, post_id) DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.post_likes WHERE user_id = OLD.user_id AND post_id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.reposts_view_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.post_reposts(user_id, post_id) VALUES (NEW.user_id, NEW.post_id)
    ON CONFLICT (user_id, post_id) DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.post_reposts WHERE user_id = OLD.user_id AND post_id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS likes_view_write ON public.likes;
CREATE TRIGGER likes_view_write
INSTEAD OF INSERT OR DELETE ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.likes_view_write();

DROP TRIGGER IF EXISTS reposts_view_write ON public.reposts;
CREATE TRIGGER reposts_view_write
INSTEAD OF INSERT OR DELETE ON public.reposts
FOR EACH ROW EXECUTE FUNCTION public.reposts_view_write();

GRANT SELECT, INSERT, DELETE ON public.likes, public.reposts TO authenticated;
