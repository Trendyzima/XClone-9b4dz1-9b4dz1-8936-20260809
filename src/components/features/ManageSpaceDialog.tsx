import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, Archive, Edit } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface ManageSpaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: {
    id: string;
    title: string;
    description?: string;
    is_live: boolean;
  };
  onSuccess: () => void;
}

export function ManageSpaceDialog({ open, onOpenChange, space, onSuccess }: ManageSpaceDialogProps) {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(space.title);
  const [description, setDescription] = useState(space.description || '');
  const [action, setAction] = useState<'edit' | 'delete' | 'archive' | null>(null);

  const handleEdit = async () => {
    setLoading(true);
    setAction('edit');

    try {
      const { error } = await supabase
        .from('spaces')
        .update({
          title: title.trim(),
          description: description.trim(),
        })
        .eq('id', space.id);

      if (error) throw error;

      toast.success('Space updated successfully');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating space:', error);
      toast.error(error.message || 'Failed to update space');
    } finally {
      setLoading(false);
      setAction(null);
    }
  };

  const handleArchive = async () => {
    if (!window.confirm('Archive this space? It will no longer be live but recordings will be preserved.')) {
      return;
    }

    setLoading(true);
    setAction('archive');

    try {
      const { error } = await supabase
        .from('spaces')
        .update({
          is_archived: true,
          is_live: false,
          archived_at: new Date().toISOString(),
        })
        .eq('id', space.id);

      if (error) throw error;

      toast.success('Space archived successfully');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error archiving space:', error);
      toast.error(error.message || 'Failed to archive space');
    } finally {
      setLoading(false);
      setAction(null);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this space permanently? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    setAction('delete');

    try {
      const { error } = await supabase
        .from('spaces')
        .delete()
        .eq('id', space.id);

      if (error) throw error;

      toast.success('Space deleted successfully');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error deleting space:', error);
      toast.error(error.message || 'Failed to delete space');
    } finally {
      setLoading(false);
      setAction(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Space</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Edit Section */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Space title"
                maxLength={100}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Space description"
                rows={3}
                maxLength={500}
                disabled={loading}
              />
            </div>

            <Button
              onClick={handleEdit}
              disabled={loading || !title.trim()}
              className="w-full"
            >
              {loading && action === 'edit' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Edit className="w-4 h-4 mr-2" />
                  Update Space
                </>
              )}
            </Button>
          </div>

          <div className="border-t border-border pt-6 space-y-3">
            <h4 className="font-semibold text-sm text-muted-foreground">Danger Zone</h4>
            
            <Button
              onClick={handleArchive}
              disabled={loading || !space.is_live}
              variant="outline"
              className="w-full"
            >
              {loading && action === 'archive' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Archive className="w-4 h-4 mr-2" />
                  Archive Space
                </>
              )}
            </Button>

            <Button
              onClick={handleDelete}
              disabled={loading}
              variant="destructive"
              className="w-full"
            >
              {loading && action === 'delete' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Space Permanently
                </>
              )}
            </Button>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>Note:</strong> Archiving preserves recordings for 24 hours. Deleting removes everything permanently.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
