'use client';

import { Search, Bell, Moon, Menu } from 'lucide-react';

export default function Header({ title, username, onMenuClick }) {
  return (
    <header className="header-container">
      {/* Page Title & Welcome (matching top header "Welcome Nirmal !" in the reference image) */}
      <div className="header-welcome" style={{ display: 'flex', alignItems: 'center' }}>
        <button 
          className="menu-btn header-icon-btn" 
          onClick={onMenuClick} 
          type="button"
          style={{ display: 'none', marginRight: '16px', padding: '8px', border: 'none', background: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}
        >
          <Menu size={20} />
        </button>
        <div>
          <h1>Welcome {username?.split(' ')[0] || 'User'} !</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Here is your {title} overview for today.
          </p>
        </div>
      </div>

      {/* Header controls: Search, Notification, Dark mode icon (matching top-right in reference image) */}
      <div className="header-controls">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search exam, courses, topics..." 
            className="search-input"
          />
        </div>

        {/* Action Icon Buttons */}
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
