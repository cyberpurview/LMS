'use client';

import { UserPlus, Loader2 } from 'lucide-react';

export default function EnrollModule({
  students,
  quizzes,
  selectedStudent, setSelectedStudent,
  selectedQuiz, setSelectedQuiz,
  registering,
  registerMessage,
  handleRegisterStudent
}) {
  return (
    <div className="content-card" style={{ maxWidth: '600px' }}>
      <div className="content-card-header">
        <h2 className="content-card-title">
          <UserPlus size={22} style={{ color: 'var(--primary)' }} />
          Enroll Student in Practice Exam
        </h2>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '24px' }}>
        Assign a practice exam to a registered student. The exam will appear immediately in their student portal.
      </p>

      {registerMessage.text && (
        <div style={{
          background: registerMessage.isError ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
          border: `1px solid ${registerMessage.isError ? 'var(--danger)' : 'var(--success)'}`,
          color: registerMessage.isError ? 'var(--danger)' : 'var(--success)',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '0.85rem',
          marginBottom: '20px'
        }}>
          {registerMessage.text}
        </div>
      )}

      <form onSubmit={handleRegisterStudent}>
        <div className="input-group">
          <label className="input-label" htmlFor="student-select">Select Student</label>
          <select
            className="select-field"
            id="student-select"
            value={selectedStudent}
            onChange={(e) => setSelectedStudent(e.target.value)}
            required
          >
            <option value="">-- Choose Student --</option>
            {students.map(st => (
              <option key={st.id} value={st.id}>
                {st.username} ({st.email})
              </option>
            ))}
          </select>
        </div>

        <div className="input-group" style={{ marginBottom: '32px' }}>
          <label className="input-label" htmlFor="quiz-select">Select Practice Exam</label>
          <select
            className="select-field"
            id="quiz-select"
            value={selectedQuiz}
            onChange={(e) => setSelectedQuiz(e.target.value)}
            required
          >
            <option value="">-- Choose Quiz --</option>
            {quizzes.map(q => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))}
          </select>
        </div>

        <button className="btn btn-primary" type="submit" disabled={registering} style={{ width: '100%' }}>
          {registering ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Enrolling Student...
            </>
          ) : (
            'Enroll Student'
          )}
        </button>
      </form>
    </div>
  );
}
