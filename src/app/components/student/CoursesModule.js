'use client';

import { GraduationCap, ChevronRight, BookOpen } from 'lucide-react';

export default function CoursesModule({ mockCourses }) {
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        {mockCourses.map(course => (
          <div 
            key={course.id} 
            className="content-card" 
            style={{ 
              padding: '24px', 
              display: 'flex', 
              flexDirection: 'column', 
              height: '100%',
              boxShadow: 'none',
              border: '1px solid var(--border-color)'
            }}
          >
            <span className="badge badge-info" style={{ alignSelf: 'flex-start', marginBottom: '16px' }}>
              CRISC Path
            </span>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '16px', flex: '1', lineHeight: '1.4', color: 'var(--text-primary)' }}>
              {course.title}
            </h3>
            
            {/* Progress Bar (sleek design) */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <span>Progress: {course.progress}%</span>
                <span>{course.completed} / {course.lessons} lessons</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(0, 0, 0, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    width: `${course.progress}%`, 
                    height: '100%', 
                    background: 'var(--primary)', 
                    borderRadius: '3px',
                    transition: 'width 0.4s ease'
                  }}
                ></div>
              </div>
            </div>

            <button className="btn btn-primary" style={{ padding: '10px 16px', fontSize: '0.85rem', width: '100%' }} type="button">
              {course.progress > 0 ? 'Resume Course' : 'Start Course'}
              <ChevronRight size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
