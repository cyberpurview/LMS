'use client';

import { Search, Bell, Moon } from 'lucide-react';

export default function Header({ title, username }) {
  return (
    <header className="header-container">
      {/* Title & Welcome */}
      <div className="header-welcome">
        <h1>Welcome {username?.split(' ')[0] || 'Admin'} !</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Here is your CyberPurview {title} panel.
        </p>
      </div>

      {/* Header controls: Search, Notification, Dark mode */}
      <div className="header-controls">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search students, quizzes, scores..." 
            className="search-input"
          />
        </div>

        <button className="header-icon-btn" title="Toggle Dark Mode" type="button">
          <Moon size={18} />
        </button>

        <button className="header-icon-btn" title="Notifications" type="button">
          <Bell size={18} />
        </button>
      </div>
    </header>
  );
}
