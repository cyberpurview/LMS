'use client';

import { Award, Printer } from 'lucide-react';

export default function CertificatesModule({ completedQuizzes, setSelectedCert }) {
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

      {completedQuizzes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--text-secondary)' }}>
          <Award size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          <p style={{ fontSize: '1.1rem', marginBottom: '8px' }}>No certificates earned yet.</p>
          <p style={{ fontSize: '0.875rem' }}>Complete any exam with a score of 70% or more to unlock your official certificate.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          {completedQuizzes.map(quiz => (
            <div 
              key={quiz.id} 
              className="content-card" 
              style={{ 
                padding: '24px', 
                display: 'flex', 
                flexDirection: 'column', 
                height: '100%', 
                position: 'relative', 
                boxShadow: 'none',
                border: '1px dashed var(--secondary)' 
              }}
            >
              <Award size={36} style={{ color: 'var(--secondary)', marginBottom: '16px' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: '600', marginBottom: '6px', color: 'var(--text-primary)' }}>
                Certificate of Achievement
              </h3>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                For completing <strong>{quiz.title}</strong>
              </p>
              
              <div style={{ background: 'rgba(13, 148, 136, 0.04)', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', fontSize: '0.8125rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Score Achieved:</span>
                  <strong style={{ color: 'var(--secondary)' }}>{quiz.score}%</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                  <strong style={{ color: 'var(--success)' }}>VERIFIED</strong>
                </div>
              </div>

              <button 
                className="btn btn-secondary" 
                style={{ padding: '10px 16px', fontSize: '0.85rem', width: '100%', marginTop: 'auto' }}
                onClick={() => setSelectedCert(quiz)}
                type="button"
              >
                View Official Certificate
                <Printer size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
