'use client';

import { useState } from 'react';
import { BookOpen, Upload, Clock, ClipboardList, Loader2, Play } from 'lucide-react';

export default function QuizzesModule({
  quizzes,
  quizTitle, setQuizTitle,
  quizDuration, setQuizDuration,
  creatingQuiz,
  quizMessage, setQuizMessage,
  handleCreateQuiz,
  setQuizJSON
}) {
  const [dragActive, setDragActive] = useState(false);

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
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      {quiz.title}
                    </h3>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <span>Duration: {Math.floor(quiz.duration / 60)} mins</span>
                      <span>•</span>
                      <span>Created: {new Date(quiz.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span className="badge badge-info" style={{ textTransform: 'none' }}>
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
