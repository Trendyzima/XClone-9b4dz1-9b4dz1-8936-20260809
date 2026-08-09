import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Image, Video, Loader2, X, BarChart3, Smile, Calendar, ShoppingBag, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CreatePollDialog } from './CreatePollDialog';
import { SchedulePostDialog } from './SchedulePostDialog';
import { ProductTagDialog } from './ProductTagDialog';
import { GifPicker } from './GifPicker';
import { toast as sonnerToast } from 'sonner';
import * as federation from '@/api/federation';

interface ComposePostProps {
  onSuccess?: () => void;
  communityId?: string;
}

export function ComposePost({ onSuccess, communityId }: ComposePostProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [pollData, setPollData] = useState<any>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showGifDialog, setShowGifDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [taggedProducts, setTaggedProducts] = useState<any[]>([]);
  const [postToFediverse, setPostToFediverse] = useState(false);
  const { toast } = useToast();

  if (!user) {
    return (
      <div className="border-b border-border p-8 text-center">
        <p className="text-muted-foreground mb-4">Sign in to post</p>
        <Button onClick={() => navigate('/auth')} className="rounded-full px-6">
          Sign in
        </Button>
      </div>
    );
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      
      // Check if adding these would exceed 4 images
      if (images.length + files.length > 4) {
        sonnerToast.error('Maximum 4 images per post');
        return;
      }

      // Validate each file
      const validFiles: File[] = [];
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) {
          sonnerToast.error(`${file.name} exceeds 20MB limit`);
          continue;
        }
        if (!file.type.startsWith('image/')) {
          sonnerToast.error(`${file.name} is not a valid image`);
          continue;
        }
        validFiles.push(file);
      }

      if (validFiles.length > 0) {
        setImages([...images, ...validFiles].slice(0, 4));
        setVideo(null);
        setGifUrl(null);
        sonnerToast.success(`${validFiles.length} image(s) added`);
      }
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      
      console.log('Video file selected:', file.name, 'Size:', file.size, 'Type:', file.type);
      
      // Check file type
      if (!file.type.startsWith('video/')) {
        sonnerToast.error('Please select a valid video file');
        return;
      }
      
      // Check file size (20MB limit)
      if (file.size > 20 * 1024 * 1024) {
        sonnerToast.error('Video must be less than 20MB');
        return;
      }
      
      // Preview video before setting
      const videoUrl = URL.createObjectURL(file);
      const videoElement = document.createElement('video');
      videoElement.src = videoUrl;
      
      videoElement.onloadedmetadata = () => {
        // Check video duration (max 10 minutes for free users)
        const maxDuration = user?.creator_tier !== 'free' ? 3600 : 600; // 1 hour for premium, 10 min for free
        if (videoElement.duration > maxDuration) {
          const maxMin = Math.floor(maxDuration / 60);
          sonnerToast.error(`Video duration cannot exceed ${maxMin} minutes`);
          URL.revokeObjectURL(videoUrl);
          return;
        }
        
        console.log('Video validated successfully, duration:', videoElement.duration);
        setVideo(file);
        setImages([]);
        setGifUrl(null);
        sonnerToast.success('Video ready to upload!');
      };
      
      videoElement.onerror = () => {
        sonnerToast.error('Failed to load video. Please try a different file.');
        URL.revokeObjectURL(videoUrl);
      };
    }
  };

  const handlePollCreated = (data: { question: string; options: string[]; duration: number }) => {
    setPollData(data);
    setShowPollDialog(false);
    sonnerToast.success('Poll attached');
  };

  const handleSchedule = (date: Date) => {
    setScheduledDate(date);
    setShowScheduleDialog(false);
    sonnerToast.success('Post scheduled');
  };

  const handleProductsSelected = (products: any[]) => {
    setTaggedProducts(products);
    sonnerToast.success(`${products.length} product(s) tagged`);
  };

  const handlePost = async () => {
    if (!content.trim() && images.length === 0 && !video && !gifUrl && !pollData) return;

    setLoading(true);

    try {
      let imageUrls: string[] = [];
      let videoUrl = null;

      // Upload multiple images
      if (images.length > 0) {
        console.log(`Uploading ${images.length} image(s)...`);
        sonnerToast.loading(`Uploading ${images.length} image(s)...`);
        
        for (let i = 0; i < images.length; i++) {
          const image = images[i];
          const fileExt = image.name.split('.').pop();
          const fileName = `${user.id}/${Date.now()}_${i}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('posts')
            .upload(fileName, image, {
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) {
            console.error('Image upload error:', uploadError);
            sonnerToast.error(`Failed to upload image ${i + 1}`);
            continue;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('posts')
            .getPublicUrl(fileName);

          imageUrls.push(publicUrl);
        }
        
        sonnerToast.dismiss();
        if (imageUrls.length > 0) {
          sonnerToast.success(`${imageUrls.length} image(s) uploaded successfully!`);
        }
      }

      // Upload video - CRITICAL FIX
      if (video) {
        console.log('Starting video upload...', video.name);
        sonnerToast.loading('Uploading video...');
        
        const fileExt = video.name.split('.').pop();
        const fileName = `videos/${user.id}/${Date.now()}.${fileExt}`;
        
        console.log('Uploading to:', fileName);
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('posts')
          .upload(fileName, video, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          console.error('Video upload error:', uploadError);
          sonnerToast.dismiss();
          sonnerToast.error(`Upload failed: ${uploadError.message}`);
          setLoading(false);
          return;
        }

        console.log('Video uploaded successfully:', uploadData);

        const { data: { publicUrl } } = supabase.storage
          .from('posts')
          .getPublicUrl(fileName);

        videoUrl = publicUrl;
        console.log('Video public URL:', videoUrl);
        sonnerToast.dismiss();
        sonnerToast.success('Video uploaded successfully!');
      }

      // If scheduled, create scheduled_post instead
      if (scheduledDate) {
        const { error: scheduleError } = await supabase.from('scheduled_posts').insert({
          user_id: user.id,
          content: content.trim(),
          image_url: imageUrls.length > 0 ? imageUrls[0] : (gifUrl || null),
          video_url: videoUrl,
          scheduled_for: scheduledDate.toISOString(),
          status: 'pending'
        });

        if (scheduleError) throw scheduleError;

        setContent('');
        setImages([]);
        setVideo(null);
        setPollData(null);
        setGifUrl(null);
        setScheduledDate(null);
        setTaggedProducts([]);
        toast({ title: 'Success', description: 'Post scheduled successfully' });
        onSuccess?.();
        setLoading(false);
        return;
      }

      // Prepare post data - CRITICAL FIX FOR VIDEO
      const postPayload: any = {
        user_id: user.id,
        content: content.trim() || '',
        community_id: communityId || null,
        media_urls: [],
        media_count: 0,
        is_video: false,
      };

      // Handle video - THIS IS THE CRITICAL FIX
      if (videoUrl && video) {
        console.log('Setting video in post payload:', videoUrl);
        postPayload.video_url = videoUrl;
        postPayload.is_video = true;
        postPayload.image_url = null;
        postPayload.media_urls = [];
        postPayload.media_count = 0;
      } 
      // Handle images
      else if (imageUrls.length > 0) {
        postPayload.image_url = imageUrls[0];
        postPayload.media_urls = imageUrls;
        postPayload.media_count = imageUrls.length;
        postPayload.is_video = false;
        postPayload.video_url = null;
      } 
      // Handle GIF
      else if (gifUrl) {
        postPayload.image_url = gifUrl;
        postPayload.media_urls = [gifUrl];
        postPayload.media_count = 1;
        postPayload.is_video = false;
        postPayload.video_url = null;
      }

      console.log('Creating post with payload:', JSON.stringify(postPayload, null, 2));

      const { data: postData, error: postError } = await supabase
        .from('posts')
        .insert(postPayload)
        .select()
        .single();

      if (postError) {
        console.error('Post creation error:', postError);
        throw postError;
      }

      console.log('Post created successfully:', postData);

      // Create poll if attached
      if (pollData && postData) {
        const expiresAt = new Date(Date.now() + pollData.duration * 60 * 1000);
        
        const { data: poll, error: pollError } = await supabase
          .from('polls')
          .insert({
            post_id: postData.id,
            question: pollData.question,
            expires_at: expiresAt.toISOString()
          })
          .select()
          .single();

        if (pollError) throw pollError;

        // Create poll options
        const optionsData = pollData.options.map((opt: string) => ({
          poll_id: poll.id,
          option_text: opt
        }));

        const { error: optionsError } = await supabase
          .from('poll_options')
          .insert(optionsData);

        if (optionsError) throw optionsError;
      }

      // Tag products
      if (taggedProducts.length > 0 && postData) {
        const productTags = taggedProducts.map(product => ({
          post_id: postData.id,
          product_id: product.id
        }));

        const { error: tagError } = await supabase
          .from('product_tags')
          .insert(productTags);

        if (tagError) console.error('Error tagging products:', tagError);
      }

      // Post to Fediverse if toggled
      if (postToFediverse) {
        try {
          await federation.postStatus({
            content: content.trim(),
            visibility: 'public',
          });
          sonnerToast.success('Also posted to Fediverse!');
        } catch (fedErr: any) {
          console.warn('[Fediverse] Post failed (non-fatal):', fedErr.message);
          sonnerToast.info('Posted locally. Fediverse delivery pending gateway setup.');
        }
      }

      setContent('');
      setImages([]);
      setVideo(null);
      setPollData(null);
      setGifUrl(null);
      setScheduledDate(null);
      setTaggedProducts([]);
      setPostToFediverse(false);
      sonnerToast.success('Post created successfully!');
      toast({ title: 'Success', description: 'Post created successfully' });
      onSuccess?.();
    } catch (error: any) {
      console.error('Post error:', error);
      sonnerToast.error(error.message || 'Failed to create post');
      toast({
        title: 'Error',
        description: error.message || 'Failed to create post',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-b border-border p-4">
      <div className="flex space-x-3">
        <div 
          className="w-10 h-10 rounded-full bg-muted flex-shrink-0 overflow-hidden cursor-pointer"
          onClick={() => navigate(`/profile/${user.username}`)}
        >
          {user.avatar ? (
            <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm font-bold">
              {user.username[0].toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <Textarea
            placeholder="What's happening?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[80px] border-0 resize-none focus-visible:ring-0 p-0 text-lg bg-transparent w-full"
            maxLength={700}
          />
          
          {/* Multiple Images Grid */}
          {images.length > 0 && (
            <div className={`mt-2 gap-2 ${
              images.length === 1 ? 'grid grid-cols-1' :
              images.length === 2 ? 'grid grid-cols-2' :
              images.length === 3 ? 'grid grid-cols-2' :
              'grid grid-cols-2'
            }`}>
              {images.map((image, index) => (
                <div 
                  key={index} 
                  className={`relative rounded-2xl overflow-hidden ${
                    images.length === 3 && index === 0 ? 'col-span-2' : ''
                  }`}
                >
                  <img
                    src={URL.createObjectURL(image)}
                    alt={`Upload ${index + 1}`}
                    className="w-full h-full object-cover max-h-96"
                  />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 bg-black/80 hover:bg-black text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {video && (
            <div className="mt-2 relative rounded-2xl overflow-hidden max-w-full">
              <video
                src={URL.createObjectURL(video)}
                controls
                className="max-h-96 w-full"
              />
              <button
                onClick={() => setVideo(null)}
                className="absolute top-2 right-2 bg-black/80 hover:bg-black text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {pollData && (
            <div className="mt-2 p-3 border border-border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <BarChart3 className="w-4 h-4" />
                  Poll attached
                </div>
                <button
                  onClick={() => setPollData(null)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
              </div>
              <p className="text-sm text-muted-foreground break-words">{pollData.question}</p>
            </div>
          )}
          {scheduledDate && (
            <div className="mt-2 p-3 border border-border rounded-lg bg-primary/5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Calendar className="w-4 h-4" />
                  Scheduled
                </div>
                <button
                  onClick={() => setScheduledDate(null)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                {scheduledDate.toLocaleString()}
              </p>
            </div>
          )}
          {taggedProducts.length > 0 && (
            <div className="mt-2 p-3 border border-border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShoppingBag className="w-4 h-4" />
                  {taggedProducts.length} product{taggedProducts.length !== 1 ? 's' : ''} tagged
                </div>
                <button
                  onClick={() => setTaggedProducts([])}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {taggedProducts.map(product => (
                  <div key={product.id} className="px-2 py-1 bg-muted rounded text-xs truncate">
                    {product.name} - ${product.price}
                  </div>
                ))}
              </div>
            </div>
          )}
          {gifUrl && (
            <div className="mt-2 relative rounded-2xl overflow-hidden max-w-full">
              <img src={gifUrl} alt="GIF" className="max-h-96 w-full object-cover" />
              <button
                onClick={() => setGifUrl(null)}
                className="absolute top-2 right-2 bg-black/80 hover:bg-black text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border overflow-x-auto">
            <div className="flex space-x-2">
              <label className="cursor-pointer p-2 hover:bg-primary/10 rounded-full text-primary transition-colors flex-shrink-0">
                <Image className="w-5 h-5" />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageChange}
                  disabled={loading || !!video || !!gifUrl || images.length >= 4}
                />
              </label>
              <label className="cursor-pointer p-2 hover:bg-primary/10 rounded-full text-primary transition-colors flex-shrink-0">
                <Video className="w-5 h-5" />
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleVideoChange}
                  disabled={loading || images.length > 0 || !!gifUrl}
                />
              </label>
              <button
                onClick={() => setShowGifDialog(true)}
                disabled={loading || images.length > 0 || !!video}
                className="cursor-pointer p-2 hover:bg-primary/10 rounded-full text-primary transition-colors disabled:opacity-50 flex-shrink-0"
                title="Add GIF"
              >
                <Smile className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowPollDialog(true)}
                disabled={loading || !!pollData}
                className="cursor-pointer p-2 hover:bg-primary/10 rounded-full text-primary transition-colors disabled:opacity-50 flex-shrink-0"
                title="Add poll"
              >
                <BarChart3 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowScheduleDialog(true)}
                disabled={loading || !!scheduledDate}
                className="cursor-pointer p-2 hover:bg-primary/10 rounded-full text-primary transition-colors disabled:opacity-50 flex-shrink-0"
                title="Schedule post"
              >
                <Calendar className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowProductDialog(true)}
                disabled={loading}
                className="cursor-pointer p-2 hover:bg-primary/10 rounded-full text-primary transition-colors disabled:opacity-50 flex-shrink-0"
                title="Tag products"
              >
                <ShoppingBag className="w-5 h-5" />
              </button>
              <button
                onClick={() => setPostToFediverse(v => !v)}
                disabled={loading}
                className={`cursor-pointer p-2 rounded-full transition-colors disabled:opacity-50 flex-shrink-0 ${
                  postToFediverse
                    ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400'
                    : 'hover:bg-primary/10 text-muted-foreground'
                }`}
                title={postToFediverse ? 'Will post to Fediverse' : 'Also post to Fediverse'}
              >
                <Globe className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center space-x-3 flex-shrink-0">
              {images.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {images.length}/4 images
                </span>
              )}
              {content.length > 0 && (
                <span className={`text-sm ${content.length > 680 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {content.length}/700
                </span>
              )}
              {postToFediverse && (
                <span className="flex items-center gap-1 text-xs text-purple-500 font-medium">
                  <Globe className="w-3 h-3" />
                  +Fediverse
                </span>
              )}
              <Button
                onClick={handlePost}
                disabled={loading || (!content.trim() && images.length === 0 && !video && !gifUrl && !pollData) || content.length > 700}
                className="rounded-full px-6 font-semibold"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}
              </Button>
            </div>
          </div>
          {showGifDialog && (
            <GifPicker
              onSelect={(url) => {
                setGifUrl(url);
                setImages([]);
                setVideo(null);
                setShowGifDialog(false);
              }}
              onClose={() => setShowGifDialog(false)}
            />
          )}
        </div>
      </div>
      {showPollDialog && (
        <CreatePollDialog
          onClose={() => setShowPollDialog(false)}
          onPollCreated={handlePollCreated}
        />
      )}
      {showScheduleDialog && (
        <SchedulePostDialog
          onClose={() => setShowScheduleDialog(false)}
          onSchedule={handleSchedule}
        />
      )}
      {showProductDialog && (
        <ProductTagDialog
          onClose={() => setShowProductDialog(false)}
          onProductSelected={handleProductsSelected}
        />
      )}
    </div>
  );
}
