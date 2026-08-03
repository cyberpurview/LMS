'use client';

import { ClipboardList, Clock, CheckCircle, RotateCcw } from 'lucide-react';

export default function AttemptsModule({ attempts, onResetAttempt }) {
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const completedCount = attempts.filter(a => a.submittedAt).length;
  const inProgressCount = attempts.filter(a => !a.submittedAt).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* Overview stats block for attempts */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-primary">
            <ClipboardList size={22} />
          </div>
          <div className="stat-details">
            <div className="stat-value">{attempts.length}</div>
            <div className="stat-label">Total Attempts</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-success">
            <CheckCircle size={22} />
          </div>
          <div className="stat-details">
            <div className="stat-value">{completedCount}</div>
            <div className="stat-label">Completed</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-warning">
            <Clock size={22} />
          </div>
          <div className="stat-details">
            <div className="stat-value">{inProgressCount}</div>
            <div className="stat-label">Active (In Progress)</div>
          </div>
        </div>
      </section>

      {/* Main Attempts Logs Card */}
      <div className="content-card">
        <div className="content-card-header">
          <h2 className="content-card-title">
            <ClipboardList size={22} style={{ color: 'var(--primary)' }} />
            Student Quiz Attempt Logs
          </h2>
        </div>

        {attempts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            No student quiz attempts recorded yet.
          </div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Practice Exam</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Started At</th>
                  <th>Submitted At</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map(attempt => (
                  <tr key={attempt.id}>
                    <td style={{ fontWeight: '600' }}>
                      {attempt.studentName}
                    </td>
                    <td>{attempt.quizTitle}</td>
                    <td>
                      {attempt.submittedAt ? (
                        <span className="badge badge-success">Completed</span>
                      ) : (
                        <span className="badge badge-warning">In Progress</span>
                      )}
                    </td>
                    <td style={{ fontWeight: '700' }}>
                      {attempt.score !== null ? `${attempt.score}%` : '-'}
                    </td>
                    <td>{formatDateTime(attempt.startedAt)}</td>
                    <td>{formatDateTime(attempt.submittedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        className="btn btn-outline" 
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to allow ${attempt.studentName} to retake ${attempt.quizTitle}? This will permanently delete their current score and answers.`)) {
                            onResetAttempt(attempt.id);
                          }
                        }}
                        style={{ 
                          padding: '6px 12px', 
                          fontSize: '0.75rem', 
                          borderColor: 'var(--accent)', 
                          color: 'var(--accent)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        type="button"
                      >
                        <RotateCcw size={12} />
                        Allow Retake
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
