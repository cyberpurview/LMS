'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username, role: 'STUDENT' },
        },
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        router.push('/student/dashboard');
        router.refresh();
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const passwordStrength = password.length === 0
    ? null
    : password.length < 6
      ? 'weak'
      : password.length < 10
        ? 'fair'
        : 'strong';

  const strengthColor = { weak: '#ef4444', fair: '#f59e0b', strong: '#10b981' };
  const strengthWidth = { weak: '33%', fair: '66%', strong: '100%' };

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
          Create your account
        </h2>
        <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '28px', textAlign: 'center' }}>
          Register to get started with CyberPurview
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

        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Full Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="username" style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>
              Full name
            </label>
            <input
              id="username"
              type="text"
              placeholder="John Doe"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
                placeholder="Min. 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
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

            {/* Password strength bar */}
            {passwordStrength && (
              <div>
                <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden', marginTop: '6px' }}>
                  <div style={{
                    height: '100%',
                    width: strengthWidth[passwordStrength],
                    background: strengthColor[passwordStrength],
                    borderRadius: '2px',
                    transition: 'all 0.3s ease',
                  }} />
                </div>
                <p style={{ fontSize: '0.72rem', color: strengthColor[passwordStrength], marginTop: '4px', fontWeight: '600', textTransform: 'capitalize' }}>
                  {passwordStrength} password
                </p>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              background: loading ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #0ea5e9)',
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
              <><Loader2 size={16} className="animate-spin" /> Creating account…</>
            ) : 'Create Account'}
          </button>
        </form>

        <p style={{
          textAlign: 'center', fontSize: '0.875rem',
          color: '#64748b', marginTop: '24px',
        }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#2563eb', fontWeight: '700', textDecoration: 'none' }}>
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
