'use client';

import { Shield, BookOpen, GraduationCap, Award, HelpCircle, Settings, LogOut, X } from 'lucide-react';
import Image from 'next/image';

export default function Sidebar({ profile, user, activeTab, setActiveTab, handleLogout, isOpen, onClose }) {
  // Get initials for avatar placeholder
  const getInitials = () => {
    if (!profile?.username) return 'CP';
    return profile.username
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <button 
          className="mobile-close-btn" 
          onClick={onClose} 
          type="button" 
          style={{ display: 'none', position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>
        <div>
          {/* Brand Header */}
          <div className="sidebar-brand" style={{ marginBottom: '32px', display: 'flex', justifyContent: 'center' }}>
            <Image
              src="/cyberwhite.png"
              alt="CyberPurview"
            width={160}
            height={45}
            style={{ objectFit: 'contain' }}
            priority
          />
        </div>

        {/* User Profile Card (Mimicking the Nirmal Kumar P card in the reference image) */}
        <div className="sidebar-profile">
          <div className="sidebar-avatar">
            {getInitials()}
          </div>
          <h2 className="sidebar-name">{profile?.username || 'Student'}</h2>
          <p className="sidebar-email">{user?.email || 'student@cyberpurview.com'}</p>
        </div>

        {/* Navigation items */}
        <nav className="sidebar-nav">
          <button 
            className={`sidebar-link ${activeTab === 'quizzes' ? 'active' : ''}`}
            onClick={() => setActiveTab('quizzes')}
            type="button"
          >
            <BookOpen size={18} />
            Quizzes
          </button>
          <button 
            className={`sidebar-link ${activeTab === 'courses' ? 'active' : ''}`}
            onClick={() => setActiveTab('courses')}
            type="button"
          >
            <GraduationCap size={18} />
            My Courses
          </button>
          <button 
            className={`sidebar-link ${activeTab === 'certificates' ? 'active' : ''}`}
            onClick={() => setActiveTab('certificates')}
            type="button"
          >
            <Award size={18} />
            Certifications
          </button>
          <button 
            className={`sidebar-link ${activeTab === 'support' ? 'active' : ''}`}
            onClick={() => setActiveTab('support')}
            type="button"
          >
            <HelpCircle size={18} />
            Support
          </button>
          <button 
            className={`sidebar-link ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            type="button"
          >
            <Settings size={18} />
            Settings
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
  </>
  );
}
