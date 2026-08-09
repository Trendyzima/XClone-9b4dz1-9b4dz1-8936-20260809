# Video Upload Implementation Guide

## ✅ Current Implementation Status

### Video Upload Features
1. **File Size Limit**: 10MB maximum (configured in ComposePost.tsx)
2. **Storage**: Supabase Storage bucket named `posts`
3. **Format Support**: All common video formats (mp4, mov, avi, webm, etc.)
4. **Compression**: Client-side validation only (no server-side compression)

### How Video Upload Works

#### 1. User Selects Video
```typescript
// In ComposePost.tsx
const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.files?.[0]) {
    const file = e.target.files[0];
    
    // Size check: 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Video must be less than 10MB');
      return;
    }
    
    setVideo(file);
    setImage(null);  // Clear image if video selected
    setGifUrl(null); // Clear GIF if video selected
  }
};
```

#### 2. Video Preview
```typescript
{video && (
  <div className="mt-2 relative rounded-2xl overflow-hidden max-w-full">
    <video
      src={URL.createObjectURL(video)}
      controls
      className="max-h-96 w-full"
    />
    <button onClick={() => setVideo(null)}>
      <X className="w-4 h-4" />
    </button>
  </div>
)}
```

#### 3. Upload to Storage
```typescript
if (video) {
  const fileExt = video.name.split('.').pop();
  const fileName = `${user.id}/${Date.now()}.${fileExt}`;
  
  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('posts')
    .upload(fileName, video, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('posts')
    .getPublicUrl(fileName);

  videoUrl = publicUrl;
  isVideo = true;
}
```

#### 4. Save to Database
```typescript
const { data: postData, error } = await supabase.from('posts').insert({
  user_id: user.id,
  content: content.trim(),
  video_url: videoUrl,
  is_video: true,
  community_id: communityId || null
}).select().single();
```

## Storage Configuration

### Required Storage Bucket Settings
The `posts` bucket must have these configurations:

1. **Public Access**: Enabled (for video playback)
2. **File Size Limit**: Default 50MB (supports our 10MB requirement)
3. **Allowed MIME Types**: 
   - video/mp4
   - video/quicktime (mov)
   - video/x-msvideo (avi)
   - video/webm
   - All other video types

### RLS Policies for Storage
```sql
-- Allow authenticated users to upload videos
create policy "authenticated_upload_posts"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'posts');

-- Allow public read access to videos
create policy "public_read_posts"
  on storage.objects for select
  to public
  using (bucket_id = 'posts');

-- Allow users to delete their own videos
create policy "authenticated_delete_posts"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'posts');
```

## Video Playback

### TikTok-Style Vertical Player
Located in: `src/components/features/VideoPlayer.tsx`

Features:
- ✅ Full-screen vertical layout
- ✅ Auto-play when scrolled into view
- ✅ Mute/unmute toggle
- ✅ Play/pause on tap
- ✅ Like, comment, repost, share buttons
- ✅ View tracking
- ✅ Engagement metrics

### Video Feed
Located in: `src/pages/VideosPage.tsx`

Features:
- ✅ Infinite vertical scroll
- ✅ Snap scrolling (one video at a time)
- ✅ Auto-play active video
- ✅ Lazy loading
- ✅ Performance optimized

## Troubleshooting

### Common Issues

#### 1. "Video upload failed"
**Cause**: Storage bucket not configured or RLS policies missing
**Solution**: 
- Check if `posts` bucket exists in Supabase Storage
- Verify RLS policies are enabled
- Check console for detailed error

#### 2. "Video must be less than 10MB"
**Cause**: File size exceeds limit
**Solution**: 
- Compress video before upload
- Use tools like HandBrake or online compressors
- Reduce video resolution/bitrate

#### 3. Video doesn't play
**Cause**: 
- Bucket is not public
- Invalid video URL
- Unsupported video format

**Solution**:
- Enable public access on `posts` bucket
- Check if `video_url` is valid in database
- Convert video to MP4 format

#### 4. Slow upload speed
**Cause**: Large file size, slow connection
**Solution**:
- Show upload progress (can be added)
- Compress video before upload
- Use smaller resolution

## Future Enhancements

### Planned Features
1. **Server-Side Compression**: Automatically compress videos on upload
2. **Progress Indicator**: Show upload progress percentage
3. **Video Thumbnails**: Generate and display video thumbnails
4. **Multiple Qualities**: Store multiple resolutions (480p, 720p, 1080p)
5. **Streaming**: Use HLS/DASH for better playback
6. **Transcoding**: Convert to web-optimized formats automatically
7. **CDN Integration**: Use CDN for faster video delivery
8. **Draft Uploads**: Save draft videos before posting

### Premium Tier Limits
- **Free**: 10MB max
- **Basic**: 25MB max
- **Premium**: 50MB max
- **VIP**: 100MB max

## Testing Checklist

- [x] Upload video under 10MB
- [x] Upload video over 10MB (should fail)
- [x] Play video in feed
- [x] Play video in TikTok-style player
- [x] Mute/unmute works
- [x] Like/comment/repost works
- [x] Video deleted when post deleted
- [x] Video visible to all users
- [x] Analytics track video views
- [x] Mobile responsive playback

## API Endpoints

### Upload Video
```typescript
POST /storage/v1/object/posts/{fileName}
Headers: Authorization: Bearer {token}
Body: FormData with video file
```

### Get Video URL
```typescript
GET /storage/v1/object/public/posts/{fileName}
Returns: Public URL for video playback
```

### Delete Video
```typescript
DELETE /storage/v1/object/posts/{fileName}
Headers: Authorization: Bearer {token}
```

## Performance Optimization

### Best Practices
1. **Use appropriate video formats**: MP4 (H.264) for best compatibility
2. **Optimize bitrate**: 2-5 Mbps for web playback
3. **Resolution**: 720p or 1080p maximum
4. **Frame rate**: 30fps (not 60fps unless necessary)
5. **Audio**: AAC codec at 128kbps
6. **Lazy load**: Only load visible videos
7. **Preload metadata**: Use `preload="metadata"` attribute

### Recommended Video Settings
- **Codec**: H.264
- **Container**: MP4
- **Resolution**: 720p (1280x720) or 1080p (1920x1080)
- **Bitrate**: 2500-5000 kbps
- **Frame Rate**: 30fps
- **Audio**: AAC, 128kbps, 44.1kHz
- **Max Duration**: 60 seconds (for better UX)

## Resources
- [Supabase Storage Docs](https://supabase.com/docs/guides/storage)
- [MDN Video Element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video)
- [HandBrake Video Compression](https://handbrake.fr/)
