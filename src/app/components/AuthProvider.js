'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const AuthContext = createContext({
  user: null,
  profile: null,
  loading: true,
  supabase: null,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setUser(session.user);
          setProfile({
            id: session.user.id,
            username: session.user.user_metadata?.username || session.user.email?.split('@')[0],
            role: session.user.user_metadata?.role || 'STUDENT',
          });
        }
      } catch (err) {
        console.error('Error fetching session:', err);
      } finally {
        setLoading(false);
      }
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          setUser(session.user);
          setProfile({
            id: session.user.id,
            username: session.user.user_metadata?.username || session.user.email?.split('@')[0],
            role: session.user.user_metadata?.role || 'STUDENT',
          });
          
          if (event === 'SIGNED_IN') {
            router.refresh();
          }
        } else {
          setUser(null);
          setProfile(null);
          if (event === 'SIGNED_OUT') {
            router.push('/login');
            router.refresh();
          }
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase.auth]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, supabase }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
