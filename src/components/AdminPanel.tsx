import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Shield, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface PendingUser {
  id: string;
  user_id: string;
  email: string;
  approved: boolean;
  created_at: string;
}

export default function AdminPanel() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPending = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('user_approvals')
      .select('*')
      .order('created_at', { ascending: false });
    setPending(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadPending();
  }, [open]);

  const approve = async (userId: string, email: string) => {
    await (supabase as any)
      .from('user_approvals')
      .update({ approved: true })
      .eq('user_id', userId);
    toast.success(`${email} approved!`);
    loadPending();
  };

  const revoke = async (userId: string, email: string) => {
    await (supabase as any)
      .from('user_approvals')
      .update({ approved: false })
      .eq('user_id', userId);
    toast.success(`${email} access revoked`);
    loadPending();
  };

  const pendingCount = pending.filter(p => !p.approved).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/50 text-accent-foreground text-sm font-medium hover:bg-accent transition-all"
          title="Admin: Manage Users"
        >
          <Shield size={14} />
          Admin
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center font-bold">
              {pendingCount}
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>User Approvals</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No signup requests yet.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {pending.map(user => (
              <div key={user.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                {user.approved ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-success font-semibold">Approved</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => revoke(user.user_id, user.email)}>
                      <X size={12} className="mr-1" /> Revoke
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" className="h-7 text-xs bg-success hover:bg-success/90" onClick={() => approve(user.user_id, user.email)}>
                    <Check size={12} className="mr-1" /> Approve
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
