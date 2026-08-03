'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, ArrowLeft, ArrowRight, CheckSquare, Loader2, AlertTriangle, Check, Circle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function QuizPlayer({ params: paramsPromise }) {
  const params = use(paramsPromise);
  const quizId = params.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false); // quiz already submitted by student
  const [questions, setQuestions] = useState([]);
  const [quizTitle, setQuizTitle] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // { questionId: selectedOption }
  const [timeRemaining, setTimeRemaining] = useState(null); // in seconds
  const [attemptId, setAttemptId] = useState(null);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    startQuiz();
  }, [quizId]);

  useEffect(() => {
    if (timeRemaining === null) return;

    if (timeRemaining <= 0) {
      handleAutoSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  const startQuiz = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/student/quizzes/${quizId}/start`, {
        method: 'POST'
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to start quiz');
        setLoading(false);
        return;
      }

      if (data.completed) {
        setCompleted(true);
        setQuizTitle(data.quizTitle || '');
        return;
      }

      setQuestions(data.questions || []);
      setQuizTitle(data.quizTitle || 'Practice Exam');
      setAttemptId(data.attemptId);
      setTimeRemaining(data.timeRemaining);

      // Rehydrate answers from database
      const rehydratedAnswers = {};
      if (data.savedAnswers) {
        data.savedAnswers.forEach(ans => {
          rehydratedAnswers[ans.question_id] = ans.selected_option;
        });
      }
      setAnswers(rehydratedAnswers);
    } catch (err) {
      setError('An error occurred loading the quiz. Please try refreshing.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = async (questionId, option) => {
    // Optimistic UI update
    setAnswers(prev => ({ ...prev, [questionId]: option }));
    setSavingAnswer(true);

    try {
      const res = await fetch(`/api/student/quizzes/${quizId}/save-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, selectedOption: option })
      });

      if (!res.ok) {
        const data = await res.json();
        // If time expired, auto submit
        if (data.error === 'Quiz time has elapsed') {
          handleAutoSubmit();
        }
      }
    } catch (err) {
      console.error('Failed to auto-save answer:', err);
    } finally {
      setSavingAnswer(false);
    }
  };

  const handleSubmit = async (isAuto = false) => {
    if (!isAuto && !confirm('Are you sure you want to submit your quiz?')) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/student/quizzes/${quizId}/submit`, {
        method: 'POST'
      });

      if (res.ok) {
        router.push(`/student/quiz/${quizId}/review?submitted=true${isAuto ? '&timeout=true' : ''}`);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit quiz.');
        setSubmitting(false);
      }
    } catch (err) {
      setError('Failed to submit quiz. Please try again.');
      setSubmitting(false);
    }
  };

  const handleAutoSubmit = () => {
    handleSubmit(true);
  };

  const formatTimer = (seconds) => {
    if (seconds === null) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    const formattedM = m < 10 ? `0${m}` : m;
    const formattedS = s < 10 ? `0${s}` : s;
    
    if (h > 0) {
      const formattedH = h < 10 ? `0${h}` : h;
      return `${formattedH}:${formattedM}:${formattedS}`;
    }
    return `${formattedM}:${formattedS}`;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '16px', background: 'var(--bg-app)' }}>
        <Loader2 size={40} className="animate-spin" style={{ color: 'var(--primary)' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Loading quiz environment…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-app)' }}>
        <div className="content-card" style={{ padding: '40px', maxWidth: '460px', textAlign: 'center' }}>
          <AlertTriangle size={48} style={{ color: 'var(--danger)', margin: '0 auto 16px auto' }} />
          <h2 style={{ marginBottom: '10px' }}>Quiz Error</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>{error}</p>
          <Link href="/student/dashboard" className="btn btn-primary" style={{ display: 'inline-flex' }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Quiz already completed — show notification instead of silently redirecting
  if (completed) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-app)' }}>
        <div className="content-card" style={{ padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
            <CheckCircle2 size={36} style={{ color: 'var(--success)' }} />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px' }}>
            Quiz Already Completed
          </h2>
          {quizTitle && (
            <p style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--primary)', marginBottom: '8px' }}>{quizTitle}</p>
          )}
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '28px' }}>
            You have already submitted this exam. Only an administrator can grant permission for a retake.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href={`/student/quiz/${quizId}/review`} className="btn btn-primary" style={{ padding: '10px 22px' }}>
              View Results
            </Link>
            <Link href="/student/dashboard" className="btn btn-outline" style={{ padding: '10px 22px' }}>
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const currentSelection = answers[currentQuestion?.id] || null;
  const isTimeCritical = timeRemaining !== null && timeRemaining <= 60;

  return (
    <div className="quiz-session-layout">
      {/* ── Sticky Header ── */}
      <header className="quiz-header-fixed">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--primary)', letterSpacing: '-0.5px' }}>
            CyberPurview
          </span>
          <span style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {quizTitle || 'Practice Exam'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className={`timer-box ${isTimeCritical ? 'timer-warning' : 'timer-normal'}`} style={{ boxShadow: 'none' }}>
            <Clock size={16} />
            <span>{formatTimer(timeRemaining)}</span>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            style={{ padding: '9px 18px', fontSize: '0.85rem' }}
            type="button"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <><CheckSquare size={15} /> Submit Exam</>}
          </button>
        </div>
      </header>

      {/* ── Body: Question Column + Navigator Sidebar ── */}
      <div className="quiz-body-split">

        {/* ── Main Question Column ── */}
        <div className="quiz-left-panel">
          <div style={{ maxWidth: '720px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* Progress bar */}
            <div style={{ marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="quiz-progress-bar-container" style={{ margin: 0, flex: 1 }}>
                  <div
                    className="quiz-progress-bar-fill"
                    style={{
                      width: `${((currentIndex + 1) / totalQuestions) * 100}%`,
                      background: isTimeCritical ? 'var(--danger)' : 'var(--primary)'
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {Math.round(((currentIndex + 1) / totalQuestions) * 100)}%
                </span>
              </div>
            </div>

            {/* Question text */}
            <div style={{ marginBottom: '28px' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                Question {currentIndex + 1}/{totalQuestions}
              </p>
              <p style={{ fontSize: '1.1rem', fontWeight: '500', lineHeight: '1.65', color: 'var(--text-primary)' }}>
                {currentQuestion?.text}
              </p>
            </div>

            {/* Answer Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              {[
                { key: 'A', text: currentQuestion?.option_a },
                { key: 'B', text: currentQuestion?.option_b },
                { key: 'C', text: currentQuestion?.option_c },
                { key: 'D', text: currentQuestion?.option_d }
              ].map(opt => {
                const isSelected = currentSelection === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => handleSelectOption(currentQuestion.id, opt.key)}
                    disabled={submitting}
                    type="button"
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '14px 18px',
                      borderRadius: '8px',
                      background: isSelected ? 'rgba(59, 130, 246, 0.06)' : '#ffffff',
                      border: isSelected ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                      color: 'var(--text-primary)',
                      fontSize: '0.925rem',
                      fontFamily: 'var(--font-sans)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      fontWeight: isSelected ? '500' : '400',
                    }}
                  >
                    <span style={{
                      minWidth: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      background: isSelected ? 'var(--primary)' : '#f1f5f9',
                      color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                      flexShrink: 0,
                      transition: 'all 0.15s ease',
                    }}>
                      {opt.key}
                    </span>
                    {opt.text}
                  </button>
                );
              })}
            </div>

            {savingAnswer && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '10px' }}>
                Auto-saving…
              </p>
            )}

            {/* Bottom navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
              <button
                className="btn btn-outline"
                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                disabled={currentIndex === 0 || submitting}
                type="button"
                style={{ padding: '10px 24px' }}
              >
                <ArrowLeft size={15} /> Previous
              </button>

              {currentIndex < totalQuestions - 1 ? (
                <button
                  className="btn btn-primary"
                  onClick={() => setCurrentIndex(prev => Math.min(totalQuestions - 1, prev + 1))}
                  disabled={submitting}
                  type="button"
                  style={{ padding: '10px 24px' }}
                >
                  Next <ArrowRight size={15} />
                </button>
              ) : (
                <button className="btn btn-outline" disabled type="button" style={{ opacity: 0.4, cursor: 'not-allowed', padding: '10px 24px' }}>
                  Last Question
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Navigator Sidebar ── */}
        <div className="quiz-right-panel">
          <p style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px', flexShrink: 0 }}>
            Questions
          </p>
          <div className="quiz-nav-list">
            {questions.map((q, idx) => {
              const isAnswered = !!answers[q.id];
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`quiz-nav-item ${isCurrent ? 'active' : ''}`}
                  type="button"
                >
                  {isAnswered ? (
                    <div className="quiz-nav-item-icon answered">
                      <Check size={10} strokeWidth={3} />
                    </div>
                  ) : (
                    <div className="quiz-nav-item-icon unanswered" />
                  )}
                  <span style={{ color: isCurrent ? 'var(--primary)' : isAnswered ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    Question {idx + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}



