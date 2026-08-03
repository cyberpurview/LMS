'use client';

import { Shield, BookOpen, UserPlus, ClipboardList, LogOut } from 'lucide-react';
import Image from 'next/image';

export default function Sidebar({ profile, user, activeTab, setActiveTab, handleLogout }) {
  const getInitials = () => {
    if (!profile?.username) return 'AP';
    return profile.username
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <aside className="sidebar">
      <div>
        {/* Brand Header */}
        <div className="sidebar-brand" style={{ marginBottom: '32px', display: 'flex', justifyContent: 'center' }}>
          <Image
            src="/logo-white.png"
            alt="CyberPurview"
            width={160}
            height={45}
            style={{ objectFit: 'contain' }}
            priority
          />
        </div>

        {/* Admin Profile Card */}
        <div className="sidebar-profile">
          <div className="sidebar-avatar" style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--primary) 100%)' }}>
            {getInitials()}
          </div>
          <h2 className="sidebar-name">{profile?.username || 'Admin'}</h2>
          <p className="sidebar-email">{user?.email || 'admin@cyberpurview.com'}</p>
        </div>

        {/* Navigation links */}
        <nav className="sidebar-nav">
          <button 
            className={`sidebar-link ${activeTab === 'quizzes' ? 'active' : ''}`}
            onClick={() => setActiveTab('quizzes')}
            type="button"
          >
            <BookOpen size={18} />
            Manage Quizzes
          </button>
          <button 
            className={`sidebar-link ${activeTab === 'enroll' ? 'active' : ''}`}
            onClick={() => setActiveTab('enroll')}
            type="button"
          >
            <UserPlus size={18} />
            Enroll Student
          </button>
          <button 
            className={`sidebar-link ${activeTab === 'attempts' ? 'active' : ''}`}
            onClick={() => setActiveTab('attempts')}
            type="button"
          >
            <ClipboardList size={18} />
            Quiz Attempts
          </button>
        </nav>
      </div>

      {/* Logout button at the bottom */}
      <button 
        className="sidebar-link" 
        onClick={handleLogout} 
        style={{ color: 'var(--danger)', marginTop: 'auto' }}
        type="button"
      >
        <LogOut size={18} />
        Sign Out
      </button>
    </aside>
  );
}
