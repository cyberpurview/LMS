'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  Award, ArrowLeft, CheckCircle, XCircle, Loader2,
  AlertCircle, Circle, ChevronDown, ChevronUp, Home, Download
} from 'lucide-react';
import Link from 'next/link';

export default function AdminReviewPage({ params: paramsPromise }) {
  const params = use(paramsPromise);
  const attemptId = params.attemptId;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [review, setReview] = useState(null);
  const [expandedQuestions, setExpandedQuestions] = useState({});
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => { fetchReview(); }, [attemptId]);

  const fetchReview = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/attempts/${attemptId}/review`);
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Failed to load review');
      else setReview(data);
    } catch {
      setError('An error occurred loading the review. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id) =>
    setExpandedQuestions(prev => ({ ...prev, [id]: !prev[id] }));

  const handlePrint = () => window.print();

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '16px', background: 'var(--bg-app)' }}>
      <Loader2 size={40} className="animate-spin" style={{ color: 'var(--primary)' }} />
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Loading student review…</p>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-app)' }}>
      <div className="content-card" style={{ padding: '40px', maxWidth: '460px', textAlign: 'center' }}>
        <AlertCircle size={48} style={{ color: 'var(--danger)', margin: '0 auto 16px auto' }} />
        <h2 style={{ marginBottom: '10px' }}>Could Not Load Review</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>{error}</p>
        <button onClick={() => router.back()} className="btn btn-primary" style={{ display: 'inline-flex' }}>
          <ArrowLeft size={15} /> Go Back
        </button>
      </div>
    </div>
  );

  const { score, totalQuestions, quizTitle, studentName, startedAt, submittedAt, questions, answers } = review;
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

  const submittedDate = submittedAt ? new Date(submittedAt).toLocaleDateString([], { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
  const submittedTime = submittedAt ? new Date(submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { background: white !important; min-height: unset !important; }
          .review-body { flex-direction: column !important; overflow: visible !important; }
          .review-sidebar-admin { width: 100% !important; border-right: none !important; border-bottom: 2px solid #e2e8f0 !important; page-break-after: avoid; }
          .review-main-admin { overflow: visible !important; padding: 24px !important; }
          .content-card { box-shadow: none !important; border: 1px solid #e2e8f0 !important; break-inside: avoid; }
          .question-card { break-inside: avoid; page-break-inside: avoid; }
          @page { margin: 16mm; size: A4; }
        }
        @media (max-width: 768px) {
          .review-body { flex-direction: column !important; overflow: visible !important; }
          .review-sidebar-admin { width: 100% !important; border-right: none !important; border-bottom: 1px solid var(--border-color); }
          .review-main-admin { padding: 20px 16px !important; overflow: visible !important; }
        }

        /* PDF / Print cover header */
        .pdf-header { display: none; }
        @media print {
          .pdf-header {
            display: flex !important;
            align-items: center;
            justify-content: space-between;
            padding: 0 0 16px 0;
            border-bottom: 3px solid #1d4ed8;
            margin-bottom: 24px;
          }
          .pdf-header-brand { font-size: 1.4rem; font-weight: 900; color: #1d4ed8; letter-spacing: -0.5px; }
          .pdf-header-meta { text-align: right; font-size: 0.75rem; color: #64748b; line-height: 1.6; }
        }
      `}</style>

      {/* ── Top Bar (hidden on print) ── */}
      <header className="no-print" style={{
        height: '60px', background: '#ffffff', borderBottom: '1px solid var(--border-color)',
        padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10, flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => router.back()} className="btn btn-outline" style={{ padding: '7px 14px', fontSize: '0.85rem' }} type="button">
            <ArrowLeft size={14} /> Back
          </button>
          <span style={{ width: '1px', height: '22px', background: 'var(--border-color)' }} />
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Viewing: <strong style={{ color: 'var(--text-primary)' }}>{studentName}</strong>'s result
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handlePrint} className="btn btn-primary" style={{ padding: '8px 18px', fontSize: '0.85rem' }} type="button">
            <Download size={14} /> Download PDF
          </button>
          <Link href="/admin/dashboard" className="btn btn-outline" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
            <Home size={14} /> Dashboard
          </Link>
        </div>
      </header>

      {/* ── PDF Cover Header (print only) ── */}
      <div className="pdf-header" style={{ padding: '24px 32px 0' }}>
        <div className="pdf-header-brand">CyberPurview LMS</div>
        <div className="pdf-header-meta">
          <div>Exam Result Report</div>
          <div>{submittedDate} {submittedTime}</div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="review-body" style={{ display: 'flex', gap: '0', flex: 1, overflow: 'hidden', width: '100%' }}>

        {/* ── Left Sidebar ── */}
        <aside className="review-sidebar-admin" style={{ width: '300px', flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: '28px 24px', overflowY: 'auto', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Student info */}
          <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <p style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Student</p>
            <p style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>{studentName}</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{submittedDate}</p>
          </div>

          {/* Score card */}
          <div className="content-card" style={{ padding: '24px', textAlign: 'center', overflow: 'hidden', position: 'relative' }}>
            <div style={{
              position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)',
              width: '200px', height: '200px', borderRadius: '50%', filter: 'blur(60px)',
              background: passed ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.15)', zIndex: 0
            }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <Award size={36} style={{ color: passed ? 'var(--success)' : 'var(--danger)', margin: '0 auto 10px auto' }} />
              <p style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                {quizTitle}
              </p>
              <div style={{ fontSize: '3rem', fontWeight: '800', fontFamily: 'var(--font-title)', color: passed ? 'var(--success)' : 'var(--danger)', lineHeight: 1, margin: '10px 0 4px' }}>
                {scorePercentage}%
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                {score} / {totalQuestions} correct
              </p>
              <span style={{
                display: 'inline-block', padding: '5px 18px', borderRadius: '99px',
                background: passed ? '#d1fae5' : '#fee2e2',
                color: passed ? '#065f46' : '#991b1b',
                fontWeight: '700', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em'
              }}>
                {passed ? 'Passed ✓' : 'Failed ✗'}
              </span>

              {/* Progress bar */}
              <div style={{ marginTop: '18px', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${scorePercentage}%`, height: '100%', background: passed ? 'var(--success)' : 'var(--danger)', borderRadius: '3px', transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
                <span>Pass: 70%</span>
                <span>Score: {scorePercentage}%</span>
              </div>

              {/* Stat pills */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', gap: '6px' }}>
                {[
                  { label: 'Correct', val: correctCount, color: 'var(--success)' },
                  { label: 'Wrong', val: incorrectCount, color: 'var(--danger)' },
                  { label: 'Skipped', val: skippedCount, color: '#94a3b8' },
                ].map(s => (
                  <div key={s.label} style={{ flex: 1, padding: '10px 4px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: '800', color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Time range */}
              {startedAt && submittedAt && (
                <div style={{ marginTop: '14px', fontSize: '0.72rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                  <div>{new Date(startedAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                  <div style={{ marginTop: '2px' }}>
                    {new Date(startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → {new Date(submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Download button in sidebar too (hidden on print) */}
          <button onClick={handlePrint} className="btn btn-primary no-print" style={{ width: '100%' }} type="button">
            <Download size={15} /> Download PDF
          </button>
        </aside>

        {/* ── Main: Question Breakdown ── */}
        <main className="review-main-admin" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-app)' }}>

          {/* Filter tabs (hidden on print) */}
          <div className="no-print" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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

          {/* Print-only section title */}
          <div style={{ display: 'none' }} className="print-section-title">
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
              Question-by-Question Breakdown ({totalQuestions} Questions)
            </h2>
          </div>

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
              const isExpanded = expandedQuestions[q.id] !== false;

              const borderColor = skipped ? '#cbd5e1' : isCorrect ? 'var(--success)' : 'var(--danger)';
              const globalIdx = questions.findIndex(gq => gq.id === q.id);

              return (
                <div
                  key={q.id}
                  className="content-card question-card"
                  style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${borderColor}` }}
                >
                  <button
                    onClick={() => toggleExpand(q.id)}
                    type="button"
                    className="no-print"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: '16px', padding: '18px 24px', background: 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1, minWidth: 0 }}>
                      {skipped
                        ? <Circle size={18} style={{ color: '#94a3b8', flexShrink: 0, marginTop: '2px' }} />
                        : isCorrect
                          ? <CheckCircle size={18} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '2px' }} />
                          : <XCircle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
                      }
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--primary)', display: 'block', marginBottom: '3px' }}>Q{globalIdx + 1}</span>
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

                  {/* Print-visible question header */}
                  <div className="print-q-header" style={{ display: 'none', padding: '16px 24px 0', alignItems: 'flex-start', gap: '12px' }}>
                    {skipped
                      ? <Circle size={16} style={{ color: '#94a3b8', flexShrink: 0, marginTop: '2px' }} />
                      : isCorrect
                        ? <CheckCircle size={16} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
                        : <XCircle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                    }
                    <div>
                      <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#1d4ed8', display: 'block', marginBottom: '2px' }}>Q{globalIdx + 1} · {skipped ? 'Skipped' : isCorrect ? 'Correct' : 'Incorrect'}</span>
                      <p style={{ fontSize: '0.875rem', fontWeight: '500', color: '#1e293b', lineHeight: 1.5, margin: 0 }}>{q.text}</p>
                    </div>
                  </div>

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
                                padding: '11px 16px', borderRadius: '8px',
                                background: isCorrectOpt ? 'rgba(16,185,129,0.06)' : isWrongChoice ? 'rgba(220,38,38,0.05)' : '#fafafa',
                                border: `1px solid ${isCorrectOpt ? 'rgba(16,185,129,0.4)' : isWrongChoice ? 'rgba(220,38,38,0.3)' : '#f1f5f9'}`,
                              }}
                            >
                              <span style={{
                                minWidth: '26px', height: '26px', borderRadius: '50%', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '700',
                                background: isCorrectOpt ? '#10b981' : isWrongChoice ? '#ef4444' : '#e2e8f0',
                                color: (isCorrectOpt || isWrongChoice) ? '#ffffff' : '#64748b',
                                flexShrink: 0,
                              }}>
                                {opt.key}
                              </span>
                              <span style={{
                                fontSize: '0.875rem', flex: 1,
                                color: isCorrectOpt ? '#065f46' : isWrongChoice ? '#991b1b' : 'var(--text-secondary)',
                                fontWeight: isCorrectOpt || isWrongChoice ? '500' : '400',
                              }}>
                                {opt.text}
                              </span>
                              {isCorrectOpt && (
                                <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: '700', whiteSpace: 'nowrap' }}>✓ Correct</span>
                              )}
                              {isWrongChoice && (
                                <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: '700', whiteSpace: 'nowrap' }}>✗ Student's choice</span>
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
