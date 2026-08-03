'use client';

import { GraduationCap, BookOpen } from 'lucide-react';

export default function CoursesModule() {
  return (
    <div className="content-card">
      <div className="content-card-header">
        <h2 className="content-card-title">
          <GraduationCap size={26} style={{ color: 'var(--primary)' }} />
          My Enrolled Courses
        </h2>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '28px' }}>
        Learn at your own pace. Watch video lectures, read course documents, and prepare for your exams.
      </p>

      <div style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--text-secondary)' }}>
        <BookOpen size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 16px auto' }} />
        <p style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--text-primary)', fontWeight: '600' }}>No courses available yet.</p>
        <p style={{ fontSize: '0.875rem' }}>Your enrolled courses will appear here once they are assigned.</p>
      </div>
    </div>
  );
}
