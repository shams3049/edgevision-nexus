import { useState } from 'react';
import { useDashboardStore } from '@/store/dashboard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';

interface AddCameraModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddCameraModal({ open, onOpenChange }: AddCameraModalProps) {
  const { addDevice } = useDashboardStore();
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    url: '',
    location: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.id || !formData.name || !formData.url) {
      alert('Please fill in all required fields');
      return;
    }

    addDevice({
      id: formData.id,
      name: formData.name,
      url: formData.url,
      location: formData.location,
      status: 'connecting',
      lastSeen: new Date(),
    });

    // Reset form
    setFormData({ id: '', name: '', url: '', location: '' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Camera
          </DialogTitle>
          <DialogDescription>
            Add a new ZED camera to the monitoring dashboard
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Camera ID <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="e.g., zed-camera-2"
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Camera Name <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="e.g., Front Entrance Camera"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              URL <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="e.g., http://localhost:5001"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Location
            </label>
            <Input
              placeholder="e.g., Building A - Floor 2"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              Add Camera
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
