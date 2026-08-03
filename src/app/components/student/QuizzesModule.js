'use client';

import Link from 'next/link';
import { BookOpen, CheckCircle, Award, AlertCircle, Loader2, Play, ArrowRight, Clock } from 'lucide-react';

export default function QuizzesModule({ quizzes, loading, formatDuration }) {
  // Metrics calculation based on attempts
  const totalRegistered = quizzes.length;
  // Get all attempts combined across all quizzes
  const allAttempts = quizzes.flatMap(q => q.attempts || []);
  const completedAttempts = allAttempts.filter(a => a.submittedAt);
  const totalCompleted = completedAttempts.length;
  const averageScore = totalCompleted > 0 
    ? Math.round(completedAttempts.reduce((acc, curr) => acc + (curr.score || 0), 0) / totalCompleted) 
    : 0;

  return (
    <>
      {/* Overview Metric Row */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-primary">
            <BookOpen size={22} />
          </div>
          <div className="stat-details">
            <div className="stat-value">{totalRegistered}</div>
            <div className="stat-label">Enrolled Quizzes</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-success">
            <CheckCircle size={22} />
          </div>
          <div className="stat-details">
            <div className="stat-value">{totalCompleted}</div>
            <div className="stat-label">Attempts Completed</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-secondary">
            <Award size={22} />
          </div>
          <div className="stat-details">
            <div className="stat-value">{averageScore}%</div>
            <div className="stat-label">Average Score</div>
          </div>
        </div>
      </section>

      {/* Main Quizzes list card */}
      <div className="content-card">
        <div className="content-card-header">
          <h2 className="content-card-title">
            <BookOpen size={22} style={{ color: 'var(--primary)' }} />
            Active Exam Registrations
          </h2>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 16px auto', color: 'var(--primary)' }} />
            Loading exam schedule...
          </div>
        ) : quizzes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--text-secondary)' }}>
            <AlertCircle size={40} style={{ color: 'var(--text-secondary)', marginBottom: '16px' }} />
            <p style={{ fontSize: '1.1rem', marginBottom: '8px' }}>No exams assigned yet.</p>
            <p style={{ fontSize: '0.875rem' }}>Your administrator will register you for quizzes shortly.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {quizzes.map(quiz => (
              <div 
                key={quiz.id} 
                className="content-card" 
                style={{ 
                  padding: '24px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '16px',
                  boxShadow: 'none',
                  border: '1px solid var(--border-color)',
                  borderLeft: quiz.status === 'IN_PROGRESS' 
                    ? '4px solid var(--warning)' 
                    : quiz.status === 'COMPLETED' 
                      ? '4px solid var(--success)' 
                      : '4px solid var(--border-color)'
                }}
              >
                {/* Main row containing title and active actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', width: '100%' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '6px', color: 'var(--text-primary)' }}>
                      {quiz.title}
                    </h3>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={13} />
                        Duration: {formatDuration(quiz.duration)}
                      </span>
                      <span>•</span>
                      <span>Assigned: {new Date(quiz.registeredAt).toLocaleDateString()}</span>
                      {quiz.retakeAllowed && (
                        <>
                          <span>•</span>
                          <span style={{ color: 'var(--warning)', fontWeight: '600' }}>Retake Available</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {quiz.status === 'COMPLETED' && !quiz.retakeAllowed && (
                      <div style={{ textAlign: 'right' }}>
                        <span className="badge badge-success" style={{ marginBottom: '2px' }}>Completed</span>
                        {quiz.score !== null && (
                          <p style={{ fontSize: '0.8125rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                            Score: <strong style={{ color: 'var(--text-primary)' }}>{quiz.score}%</strong>
                          </p>
                        )}
                      </div>
                    )}

                    {quiz.status === 'COMPLETED' && quiz.retakeAllowed && (
                      <div style={{ textAlign: 'right' }}>
                        <span className="badge badge-warning" style={{ marginBottom: '2px' }}>Retake Ready</span>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>New Attempt Allowed</p>
                      </div>
                    )}

                    {quiz.status === 'IN_PROGRESS' && (
                      <div style={{ textAlign: 'right' }}>
                        <span className="badge badge-warning" style={{ marginBottom: '2px' }}>Resume Quiz</span>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Timer Active</p>
                      </div>
                    )}

                    {quiz.status === 'NOT_STARTED' && (
                      <span className="badge badge-info">Not Started</span>
                    )}

                    {quiz.status === 'NOT_STARTED' && (
                      <Link href={`/student/quiz/${quiz.id}`} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                        Start
                        <Play size={13} />
                      </Link>
                    )}

                    {quiz.status === 'IN_PROGRESS' && (
                      <Link href={`/student/quiz/${quiz.id}`} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                        Resume
                        <Play size={13} />
                      </Link>
                    )}

                    {quiz.status === 'COMPLETED' && quiz.retakeAllowed && (
                      <Link href={`/student/quiz/${quiz.id}`} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                        Start Retake
                        <Play size={13} />
                      </Link>
                    )}

                    {quiz.status === 'COMPLETED' && !quiz.retakeAllowed && (
                      <Link href={`/student/quiz/${quiz.id}/review`} className="btn btn-outline" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                        Review Latest
                        <ArrowRight size={13} />
                      </Link>
                    )}
                  </div>
                </div>

                {/* Attempts History Section */}
                {quiz.attempts && quiz.attempts.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '4px', width: '100%' }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '10px', letterSpacing: '0.05em' }}>
                      PRACTICE EXAM ATTEMPTS HISTORY ({quiz.attempts.length})
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {quiz.attempts.map((att, index) => (
                        <div 
                          key={att.id} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            fontSize: '0.825rem', 
                            padding: '8px 14px', 
                            background: '#f8fafc', 
                            borderRadius: '8px',
                            border: '1px solid #f1f5f9'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                              Attempt #{quiz.attempts.length - index}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>|</span>
                            <span style={{ color: 'var(--text-secondary)' }}>
                              Started: {new Date(att.startedAt).toLocaleDateString()} {new Date(att.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <strong style={{ color: att.score !== null && att.score >= 70 ? 'var(--success)' : 'var(--danger)' }}>
                              Score: {att.score !== null ? `${att.score}%` : 'Incomplete'}
                            </strong>
                            
                            {att.submittedAt && (
                              <Link 
                                href={`/student/quiz/${quiz.id}/review?attemptId=${att.id}`} 
                                style={{ 
                                  color: 'var(--primary)', 
                                  textDecoration: 'none', 
                                  fontWeight: '600',
                                  fontSize: '0.8rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px'
                                }}
                              >
                                Review Questions <ArrowRight size={12} />
                              </Link>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
