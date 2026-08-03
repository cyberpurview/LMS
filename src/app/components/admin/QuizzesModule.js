'use client';

import { useState } from 'react';
import { BookOpen, Upload, Clock, ClipboardList, Loader2, Play, Edit } from 'lucide-react';

export default function QuizzesModule({
  quizzes,
  onRefresh,
  quizTitle, setQuizTitle,
  quizDuration, setQuizDuration,
  creatingQuiz,
  quizMessage, setQuizMessage,
  handleCreateQuiz,
  setQuizJSON
}) {
  const [dragActive, setDragActive] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState(null);
  const [editingDuration, setEditingDuration] = useState('');
  const [savingDuration, setSavingDuration] = useState(false);

  const handleSaveDuration = async (quizId) => {
    if (!editingDuration || parseInt(editingDuration) <= 0) return;
    setSavingDuration(true);
    try {
      const res = await fetch('/api/admin/quizzes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: quizId,
          duration: parseInt(editingDuration) * 60 // Minutes to seconds
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update time');
      
      setEditingQuizId(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingDuration(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parseFile(file);
  };

  const parseFile = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!Array.isArray(parsed)) {
          setQuizMessage({ text: 'File must contain an array of questions.', isError: true });
          return;
        }
        setQuizJSON(parsed);
        setQuizMessage({ text: `Loaded ${parsed.length} questions from ${file.name}`, isError: false });
      } catch (err) {
        setQuizMessage({ text: 'Failed to parse JSON file.', isError: true });
      }
    };
    reader.readAsText(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      parseFile(file);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* Metrics Row (Admin perspective) */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-primary">
            <BookOpen size={22} />
          </div>
          <div className="stat-details">
            <div className="stat-value">{quizzes.length}</div>
            <div className="stat-label">Active Quizzes</div>
          </div>
        </div>
      </section>

      {/* Grid of upload + lists */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '28px' }}>
        
        {/* Upload Form Card */}
        <div className="content-card">
          <div className="content-card-header">
            <h2 className="content-card-title">
              <Upload size={22} style={{ color: 'var(--primary)' }} />
              Create Practice Exam
            </h2>
          </div>

          {quizMessage.text && (
            <div style={{
              background: quizMessage.isError ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
              border: `1px solid ${quizMessage.isError ? 'var(--danger)' : 'var(--success)'}`,
              color: quizMessage.isError ? 'var(--danger)' : 'var(--success)',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '20px'
            }}>
              {quizMessage.text}
            </div>
          )}

          <form onSubmit={handleCreateQuiz}>
            <div className="input-group">
              <label className="input-label" htmlFor="quiz-title">Exam Title</label>
              <input
                className="input-field"
                type="text"
                id="quiz-title"
                placeholder="e.g. CRISC Exam Prep Question Bank"
                value={quizTitle}
                onChange={(e) => setQuizTitle(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="quiz-duration">Time Limit (Minutes)</label>
              <input
                className="input-field"
                type="number"
                id="quiz-duration"
                placeholder="e.g. 150"
                value={quizDuration}
                onChange={(e) => setQuizDuration(e.target.value)}
                required
              />
            </div>

            <div className="input-group" style={{ marginBottom: '24px' }}>
              <label className="input-label">Questions JSON Upload</label>
              
              {/* Sleek Drag & Drop zone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${dragActive ? 'var(--primary)' : 'var(--border-color)'}`,
                  background: dragActive ? 'rgba(59, 130, 246, 0.02)' : '#f8fafc',
                  borderRadius: '10px',
                  padding: '32px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.2s ease'
                }}
              >
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer'
                  }}
                />
                <Upload size={32} style={{ color: 'var(--text-secondary)', marginBottom: '12px' }} />
                <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Click to upload or drag & drop
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Only valid .json quiz files
                </p>
              </div>
            </div>

            <button className="btn btn-primary" type="submit" disabled={creatingQuiz} style={{ width: '100%' }}>
              {creatingQuiz ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Uploading Exam...
                </>
              ) : (
                'Create Exam'
              )}
            </button>
          </form>
        </div>

        {/* Active Quizzes List */}
        <div className="content-card">
          <div className="content-card-header">
            <h2 className="content-card-title">
              <BookOpen size={22} style={{ color: 'var(--primary)' }} />
              Active Exams ({quizzes.length})
            </h2>
          </div>

          {quizzes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              No exams created yet. Upload a JSON file to get started.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '460px', overflowY: 'auto', paddingRight: '4px' }}>
              {quizzes.map(quiz => (
                <div 
                  key={quiz.id} 
                  style={{ 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '10px', 
                    padding: '16px 20px', 
                    background: '#ffffff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {quiz.title}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {editingQuizId === quiz.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0' }}>
                          <input 
                            type="number" 
                            value={editingDuration}
                            onChange={(e) => setEditingDuration(e.target.value)}
                            style={{ width: '70px', padding: '2px 6px', fontSize: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                            required
                            min="1"
                          />
                          <button 
                            type="button"
                            onClick={() => handleSaveDuration(quiz.id)}
                            disabled={savingDuration}
                            className="btn btn-sm btn-primary"
                            style={{ padding: '2px 8px', fontSize: '0.7rem', borderRadius: '4px' }}
                          >
                            {savingDuration ? 'Saving...' : 'Save'}
                          </button>
                          <button 
                            type="button"
                            onClick={() => setEditingQuizId(null)}
                            className="btn btn-sm btn-outline"
                            style={{ padding: '2px 8px', fontSize: '0.7rem', borderRadius: '4px', background: '#f1f5f9' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>Duration: {Math.floor(quiz.duration / 60)} mins</span>
                          <button 
                            type="button"
                            onClick={() => {
                              setEditingQuizId(quiz.id);
                              setEditingDuration(Math.floor(quiz.duration / 60).toString());
                            }}
                            style={{
                              background: 'none', border: 'none', color: 'var(--primary)',
                              cursor: 'pointer', padding: 0, fontSize: '0.72rem',
                              display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: '600'
                            }}
                          >
                            <Edit size={11} /> Edit
                          </button>
                        </div>
                      )}
                      <span>•</span>
                      <span>Created: {new Date(quiz.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span className="badge badge-info" style={{ textTransform: 'none', marginLeft: '12px', flexShrink: 0 }}>
                    {quiz.questions?.[0]?.count || 0} Qs
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
