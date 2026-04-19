import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
      } else if (data.session) {
        // Check approval status
        const { data: approval } = await (supabase as any)
          .from('user_approvals')
          .select('approved')
          .eq('user_id', data.session.user.id)
          .maybeSingle();

        if (approval && !approval.approved) {
          await supabase.auth.signOut();
          toast.error('Your account is pending admin approval. Please wait for approval.');
        }
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Verification email sent! After verifying, an admin will approve your account.');
        // Notify admin about new signup
        if (data.user) {
          try {
            await supabase.functions.invoke('notify-admin', {
              body: { userId: data.user.id, email },
            });
          } catch (err) {
            console.error('Failed to notify admin:', err);
          }
        }
      }
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error('Enter your email'); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success('Password reset email sent!');
    setLoading(false);
  };

  if (showForgot) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="glass-panel w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="text-4xl mb-3">🔐</div>
            <h1 className="text-xl font-bold text-foreground">Reset Password</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your email to receive a reset link</p>
          </div>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="bg-background"
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send Reset Link
            </Button>
          </form>
          <button
            onClick={() => setShowForgot(false)}
            className="text-sm text-primary hover:underline w-full text-center"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-3">📊</div>
          <h1 className="text-xl font-bold text-foreground">FiFto Mechanism</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLogin ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="bg-background"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            className="bg-background"
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isLogin ? 'Sign In' : 'Sign Up'}
          </Button>
        </form>
        <div className="flex flex-col items-center gap-2 text-sm">
          {isLogin && (
            <button
              onClick={() => setShowForgot(true)}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              Forgot password?
            </button>
          )}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-primary hover:underline"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
