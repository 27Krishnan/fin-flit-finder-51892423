import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  approved: boolean | null;
  signOut: () => Promise<void>;
  recheckApproval: () => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  approved: null,
  signOut: async () => {},
  recheckApproval: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState<boolean | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkApproval = async () => {
    if (!session) {
      setApproved(null);
      return;
    }

    const { data } = await (supabase as any)
      .from('user_approvals')
      .select('approved')
      .eq('user_id', session.user.id)
      .maybeSingle();

    // No record = grandfathered user (approved)
    setApproved(data === null ? true : data.approved);
  };

  useEffect(() => {
    checkApproval();
  }, [session]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setApproved(null);
  };

  return (
    <AuthContext.Provider value={{ 
      session, 
      user: session?.user ?? null, 
      loading, 
      approved,
      signOut,
      recheckApproval: checkApproval,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
