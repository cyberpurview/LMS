'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      const role = data.user?.user_metadata?.role || 'STUDENT';
      router.push(role === 'ADMIN' ? '/admin/dashboard' : '/student/dashboard');
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      fontFamily: 'var(--font-sans)',
      background: '#f8fafc',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: '#ffffff',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      }}>
        {/* Colored logo */}
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <Image
            src="/logo-colored.png"
            alt="CyberPurview"
            width={200}
            height={60}
            style={{ objectFit: 'contain', margin: '0 auto' }}
            priority
          />
        </div>

        <h2 style={{
          fontSize: '1.75rem', fontWeight: '800', color: '#0f172a',
          marginBottom: '6px', letterSpacing: '-0.4px', textAlign: 'center'
        }}>
          Welcome back
        </h2>
        <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '32px', textAlign: 'center' }}>
          Sign in to your CyberPurview account
        </p>

        {/* Error alert */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            background: '#fef2f2', border: '1px solid #fecaca',
            color: '#dc2626', padding: '12px 14px',
            borderRadius: '10px', fontSize: '0.85rem',
            marginBottom: '20px', lineHeight: 1.5,
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Email */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="email" style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>
              Email address
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                padding: '11px 14px',
                borderRadius: '10px',
                border: '1.5px solid #e2e8f0',
                fontSize: '0.9rem',
                fontFamily: 'var(--font-sans)',
                color: '#0f172a',
                outline: 'none',
                background: '#ffffff',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          {/* Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="password" style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '11px 42px 11px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #e2e8f0',
                  fontSize: '0.9rem',
                  fontFamily: 'var(--font-sans)',
                  color: '#0f172a',
                  outline: 'none',
                  background: '#ffffff',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#94a3b8', display: 'flex', alignItems: 'center', padding: 0,
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              background: loading ? '#93c5fd' : 'linear-gradient(135deg, #1d4ed8, #2563eb)',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '0.9rem',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              fontFamily: 'var(--font-sans)',
              marginTop: '4px',
            }}
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> Signing in…</>
            ) : 'Sign In'}
          </button>
        </form>

        <p style={{
          textAlign: 'center', fontSize: '0.875rem',
          color: '#64748b', marginTop: '28px',
        }}>
          Don&apos;t have an account?{' '}
          <Link href="/register" style={{ color: '#2563eb', fontWeight: '700', textDecoration: 'none' }}>
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}
