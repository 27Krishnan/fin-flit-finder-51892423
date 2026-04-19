import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const goAuth = () => navigate({ to: '/auth' });
  const goHome = () => navigate({ to: '/' });

  useEffect(() => {
    // Check for recovery token in URL
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setReady(true);
    } else {
      // Also check if user is already authenticated via recovery flow
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setReady(true);
        else goAuth();
      });
    }
  }, [navigate]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) toast.error(error.message);
    else {
      toast.success('Password updated! Redirecting...');
      setTimeout(() => goHome(), 1500);
    }
    setLoading(false);
  };

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-3">🔑</div>
          <h1 className="text-xl font-bold text-foreground">Set New Password</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter your new password below</p>
        </div>
        <form onSubmit={handleReset} className="space-y-4">
          <Input
            type="password"
            placeholder="New password (min 6 characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            className="bg-background"
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Update Password
          </Button>
        </form>
      </div>
    </div>
  );
}
