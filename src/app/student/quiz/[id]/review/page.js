'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Award, ArrowLeft, CheckCircle, XCircle, Loader2, AlertCircle, Circle, ChevronDown, ChevronUp, Home, Download } from 'lucide-react';
import Link from 'next/link';

export default function QuizReview({ params: paramsPromise }) {
  const params = use(paramsPromise);
  const quizId = params.id;
  const searchParams = useSearchParams();

  const justSubmitted = searchParams.get('submitted') === 'true';
  const timeout = searchParams.get('timeout') === 'true';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [review, setReview] = useState(null);
  const [expandedQuestions, setExpandedQuestions] = useState({});
  const [activeFilter, setActiveFilter] = useState('all'); // all | correct | incorrect | skipped

  useEffect(() => { fetchReview(); }, [quizId]);

  const fetchReview = async () => {
    setLoading(true);
    setError('');
    try {
      const attemptId = searchParams.get('attemptId');
      const url = `/api/student/quizzes/${quizId}/review${attemptId ? `?attemptId=${attemptId}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Failed to load quiz review');
      else setReview(data);
    } catch {
      setError('An error occurred loading the review. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id) => setExpandedQuestions(prev => ({ ...prev, [id]: !prev[id] }));

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '16px', background: 'var(--bg-app)' }}>
      <Loader2 size={40} className="animate-spin" style={{ color: 'var(--primary)' }} />
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Loading your results…</p>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-app)' }}>
      <div className="content-card" style={{ padding: '40px', maxWidth: '460px', textAlign: 'center' }}>
        <AlertCircle size={48} style={{ color: 'var(--danger)', margin: '0 auto 16px auto' }} />
        <h2 style={{ marginBottom: '10px' }}>Could Not Load Review</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>{error}</p>
        <Link href="/student/dashboard" className="btn btn-primary" style={{ display: 'inline-flex' }}>
          <Home size={15} /> Back to Dashboard
        </Link>
      </div>
    </div>
  );

  const { score, totalQuestions, quizTitle, startedAt, submittedAt, questions, answers } = review;
  const scorePercentage = Math.round((score / totalQuestions) * 100);
  const passed = scorePercentage >= 70;

  const correctCount = answers.filter(a => a.is_correct).length;
  const incorrectCount = answers.filter(a => !a.is_correct && a.selected_option !== null).length;
  const skippedCount = answers.filter(a => a.selected_option === null).length;

  const filteredQuestions = questions.filter(q => {
    const ans = answers.find(a => a.question_id === q.id);
    if (activeFilter === 'correct') return ans?.is_correct;
    if (activeFilter === 'incorrect') return ans && !ans.is_correct && ans.selected_option !== null;
    if (activeFilter === 'skipped') return !ans || ans.selected_option === null;
    return true;
  });

  const filters = [
    { key: 'all', label: 'All', count: totalQuestions, color: 'var(--primary)' },
    { key: 'correct', label: 'Correct', count: correctCount, color: 'var(--success)' },
    { key: 'incorrect', label: 'Incorrect', count: incorrectCount, color: 'var(--danger)' },
    { key: 'skipped', label: 'Skipped', count: skippedCount, color: '#94a3b8' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media (max-width: 768px) {
          .review-body { flex-direction: column !important; overflow: visible !important; }
          .review-sidebar { width: 100% !important; border-right: none !important; border-bottom: 1px solid var(--border-color); }
          .review-main { padding: 20px 16px !important; overflow: visible !important; }
        }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .review-body { flex-direction: column !important; overflow: visible !important; }
          .review-sidebar { width: 100% !important; border-right: none !important; border-bottom: 2px solid #e2e8f0 !important; }
          .review-main { overflow: visible !important; padding: 24px !important; }
          .content-card { box-shadow: none !important; border: 1px solid #e2e8f0 !important; break-inside: avoid; }
          @page { margin: 16mm; size: A4; }
        }
      `}</style>

      {/* ── Top Bar ── */}
      <header className="no-print" style={{
        height: '60px', background: '#ffffff', borderBottom: '1px solid var(--border-color)',
        padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10, flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--primary)', letterSpacing: '-0.5px' }}>CyberPurview</span>
          <span style={{ width: '1px', height: '22px', background: 'var(--border-color)' }} />
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Exam Review</span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => window.print()} className="btn btn-primary" style={{ padding: '8px 18px', fontSize: '0.85rem' }} type="button">
            <Download size={14} /> Download PDF
          </button>
          <Link href="/student/dashboard" className="btn btn-outline" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
            <Home size={14} /> Dashboard
          </Link>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="review-body" style={{ display: 'flex', gap: '0', flex: 1, overflow: 'hidden', width: '100%' }}>

        {/* ── Left Sidebar: Score Card + Navigator ── */}
        <aside className="review-sidebar" style={{ width: '300px', flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: '28px 24px', overflowY: 'auto', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Score card */}
          <div className="content-card" style={{ padding: '28px 24px', textAlign: 'center', overflow: 'hidden', position: 'relative' }}>
            {/* Glow blob */}
            <div style={{
              position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)',
              width: '200px', height: '200px', borderRadius: '50%', filter: 'blur(60px)',
              background: passed ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.15)', zIndex: 0
            }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <Award size={40} style={{ color: passed ? 'var(--success)' : 'var(--danger)', margin: '0 auto 12px auto' }} />
              <p style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                {quizTitle || 'Quiz'}
              </p>

              {/* Big percentage */}
              <div style={{ fontSize: '3rem', fontWeight: '800', fontFamily: 'var(--font-title)', color: passed ? 'var(--success)' : 'var(--danger)', lineHeight: 1, margin: '12px 0 4px' }}>
                {scorePercentage}%
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                {score} / {totalQuestions} correct
              </p>

              {/* Pass / Fail badge */}
              <span style={{
                display: 'inline-block', padding: '5px 18px', borderRadius: '99px',
                background: passed ? '#d1fae5' : '#fee2e2',
                color: passed ? '#065f46' : '#991b1b',
                fontWeight: '700', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em'
              }}>
                {passed ? 'Passed ✓' : 'Failed ✗'}
              </span>

              {/* Progress bar */}
              <div style={{ marginTop: '20px', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${scorePercentage}%`, height: '100%', background: passed ? 'var(--success)' : 'var(--danger)', borderRadius: '3px', transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
                <span>Pass: 70%</span>
                <span>Your score: {scorePercentage}%</span>
              </div>

              {/* Stat pills */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', gap: '8px' }}>
                {[
                  { label: 'Correct', val: correctCount, color: 'var(--success)' },
                  { label: 'Wrong', val: incorrectCount, color: 'var(--danger)' },
                  { label: 'Skipped', val: skippedCount, color: '#94a3b8' },
                ].map(s => (
                  <div key={s.label} style={{ flex: 1, padding: '10px 4px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Time */}
              {startedAt && submittedAt && (
                <div style={{ marginTop: '16px', fontSize: '0.75rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  <div>{new Date(startedAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                  <div style={{ marginTop: '2px' }}>
                    {new Date(startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → {new Date(submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Submission notice */}
          {justSubmitted && (
            <div style={{ padding: '14px 16px', borderRadius: '10px', background: timeout ? '#fef3c7' : '#d1fae5', border: `1px solid ${timeout ? '#fde68a' : '#a7f3d0'}`, fontSize: '0.8rem', color: timeout ? '#92400e' : '#065f46', lineHeight: 1.5 }}>
              {timeout ? '⏱ Time expired — your answers were auto-submitted.' : '✓ Exam submitted and graded successfully.'}
            </div>
          )}
        </aside>

        {/* ── Main: Question Breakdown ── */}
        <main className="review-main" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-app)' }}>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {filters.map(f => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                type="button"
                style={{
                  padding: '8px 16px', borderRadius: '99px', border: '1px solid',
                  borderColor: activeFilter === f.key ? f.color : 'var(--border-color)',
                  background: activeFilter === f.key ? f.color : '#ffffff',
                  color: activeFilter === f.key ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                {f.label}
                <span style={{
                  background: activeFilter === f.key ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                  color: activeFilter === f.key ? '#ffffff' : 'var(--text-secondary)',
                  borderRadius: '99px', padding: '1px 7px', fontSize: '0.7rem', fontWeight: '700'
                }}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {/* Questions list */}
          {filteredQuestions.length === 0 ? (
            <div className="content-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No questions in this category.
            </div>
          ) : (
            filteredQuestions.map((q, idx) => {
              const ans = answers.find(a => a.question_id === q.id);
              const selected = ans?.selected_option ?? null;
              const isCorrect = ans?.is_correct ?? false;
              const skipped = selected === null;
              const isExpanded = expandedQuestions[q.id] !== false; // default open

              const borderColor = skipped ? '#cbd5e1' : isCorrect ? 'var(--success)' : 'var(--danger)';
              const globalIdx = questions.findIndex(gq => gq.id === q.id);

              return (
                <div
                  key={q.id}
                  id={`q-card-${q.id}`}
                  className="content-card"
                  style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${borderColor}` }}
                >
                  {/* Question header row — always visible, clickable to expand */}
                  <button
                    onClick={() => toggleExpand(q.id)}
                    type="button"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: '16px', padding: '18px 24px', background: 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1, minWidth: 0 }}>
                      {/* Status icon */}
                      {skipped
                        ? <Circle size={18} style={{ color: '#94a3b8', flexShrink: 0, marginTop: '2px' }} />
                        : isCorrect
                          ? <CheckCircle size={18} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '2px' }} />
                          : <XCircle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
                      }
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--primary)', display: 'block', marginBottom: '3px' }}>
                          Q{globalIdx + 1}
                        </span>
                        <p style={{
                          fontSize: '0.925rem', fontWeight: '500', color: 'var(--text-primary)',
                          lineHeight: 1.5, margin: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          display: '-webkit-box', WebkitLineClamp: isExpanded ? 'unset' : 2, WebkitBoxOrient: 'vertical'
                        }}>
                          {q.text}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: '700', padding: '3px 10px', borderRadius: '99px',
                        background: skipped ? '#f1f5f9' : isCorrect ? '#d1fae5' : '#fee2e2',
                        color: skipped ? '#64748b' : isCorrect ? '#065f46' : '#991b1b',
                        textTransform: 'uppercase', letterSpacing: '0.05em'
                      }}>
                        {skipped ? 'Skipped' : isCorrect ? 'Correct' : 'Incorrect'}
                      </span>
                      {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />}
                    </div>
                  </button>

                  {/* Expanded options */}
                  {isExpanded && (
                    <div style={{ padding: '0 24px 20px 24px', borderTop: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                        {[
                          { key: 'A', text: q.option_a },
                          { key: 'B', text: q.option_b },
                          { key: 'C', text: q.option_c },
                          { key: 'D', text: q.option_d },
                        ].map(opt => {
                          const isCorrectOpt = opt.key === q.correct_option;
                          const isSelectedOpt = opt.key === selected;
                          const isWrongChoice = isSelectedOpt && !isCorrectOpt;

                          return (
                            <div
                              key={opt.key}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '12px 16px', borderRadius: '8px',
                                background: isCorrectOpt ? 'rgba(16,185,129,0.06)' : isWrongChoice ? 'rgba(220,38,38,0.05)' : '#fafafa',
                                border: `1px solid ${isCorrectOpt ? 'rgba(16,185,129,0.4)' : isWrongChoice ? 'rgba(220,38,38,0.3)' : '#f1f5f9'}`,
                              }}
                            >
                              <span style={{
                                minWidth: '26px', height: '26px', borderRadius: '50%', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '700',
                                background: isCorrectOpt ? 'var(--success)' : isWrongChoice ? 'var(--danger)' : '#e2e8f0',
                                color: (isCorrectOpt || isWrongChoice) ? '#ffffff' : 'var(--text-secondary)',
                              }}>
                                {opt.key}
                              </span>
                              <span style={{
                                fontSize: '0.9rem', flex: 1,
                                color: isCorrectOpt ? '#065f46' : isWrongChoice ? '#991b1b' : 'var(--text-secondary)',
                                fontWeight: isCorrectOpt || isWrongChoice ? '500' : '400',
                              }}>
                                {opt.text}
                              </span>
                              {isCorrectOpt && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: '700', whiteSpace: 'nowrap' }}>✓ Correct</span>
                              )}
                              {isWrongChoice && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--danger)', fontWeight: '700', whiteSpace: 'nowrap' }}>✗ Your choice</span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {q.explanation && (
                        <div style={{ marginTop: '14px', padding: '14px 16px', background: '#f8fafc', borderRadius: '8px', borderLeft: '3px solid var(--primary)', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Explanation</strong>
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </main>
      </div>
    </div>
  );
}
