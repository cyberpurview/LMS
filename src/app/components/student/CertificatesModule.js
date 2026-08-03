'use client';

import { Award } from 'lucide-react';

export default function CertificatesModule() {
  return (
    <div className="content-card">
      <div className="content-card-header">
        <h2 className="content-card-title">
          <Award size={26} style={{ color: 'var(--secondary)' }} />
          Earned Certifications
        </h2>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '28px' }}>
        Earn official credentials upon scoring 70% or higher in your practice exams. Download and share your success.
      </p>

      <div style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--text-secondary)' }}>
        <Award size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px', margin: '0 auto' }} />
        <p style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--text-primary)', fontWeight: '600' }}>No certificates earned yet.</p>
        <p style={{ fontSize: '0.875rem' }}>Complete any exam with a passing score to unlock your official certificate here.</p>
      </div>
    </div>
  );
}
