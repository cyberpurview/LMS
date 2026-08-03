'use client';

import { Key, Loader2 } from 'lucide-react';

export default function SettingsModule({
  newPassword, setNewPassword,
  confirmPassword, setConfirmPassword,
  updatingPassword,
  settingsMessage,
  handleChangePassword
}) {
  return (
    <div className="content-card">
      <div className="content-card-header">
        <h2 className="content-card-title">
          <Key size={26} style={{ color: 'var(--primary)' }} />
          Account Settings
        </h2>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '28px' }}>
        Secure your account by updating your login password.
      </p>

      {settingsMessage.text && (
        <div style={{
          background: settingsMessage.isError ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
          border: `1px solid ${settingsMessage.isError ? 'var(--danger)' : 'var(--success)'}`,
          color: settingsMessage.isError ? 'var(--danger)' : 'var(--success)',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '0.875rem',
          marginBottom: '24px',
          maxWidth: '500px'
        }}>
          {settingsMessage.text}
        </div>
      )}

      <form onSubmit={handleChangePassword} style={{ maxWidth: '500px' }}>
        <div className="input-group">
          <label className="input-label" htmlFor="new-password">New Password</label>
          <input
            className="input-field"
            type="password"
            id="new-password"
            placeholder="Min. 6 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>

        <div className="input-group" style={{ marginBottom: '32px' }}>
          <label className="input-label" htmlFor="confirm-password">Confirm New Password</label>
          <input
            className="input-field"
            type="password"
            id="confirm-password"
            placeholder="Repeat new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        <button className="btn btn-primary" type="submit" disabled={updatingPassword}>
          {updatingPassword ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Key size={16} /> Update Password
            </>
          )}
        </button>
      </form>
    </div>
  );
}
