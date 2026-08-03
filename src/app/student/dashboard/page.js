'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/app/components/AuthProvider';
import { useRouter } from 'next/navigation';

// Modular Dashboard Components
import Sidebar from '@/app/components/student/Sidebar';
import Header from '@/app/components/student/Header';
import QuizzesModule from '@/app/components/student/QuizzesModule';
import CoursesModule from '@/app/components/student/CoursesModule';
import CertificatesModule from '@/app/components/student/CertificatesModule';
import SupportModule from '@/app/components/student/SupportModule';
import SettingsModule from '@/app/components/student/SettingsModule';

import { Shield, Printer } from 'lucide-react';

export default function StudentDashboard() {
  const { user, profile, supabase } = useAuth();
  const router = useRouter();
  
  // Tab Routing State
  const [activeTab, setActiveTab] = useState('quizzes');
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Settings states (Change Password)
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState({ text: '', isError: false });

  // Support states
  const [supportCategory, setSupportCategory] = useState('technical');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [submittingSupport, setSubmittingSupport] = useState(false);
  const [supportTicketSent, setSupportTicketSent] = useState(false);

  // Certificate Modal State
  const [selectedCert, setSelectedCert] = useState(null);

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/student/quizzes');
      const data = await res.json();
      if (res.ok) {
        setQuizzes(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching student quizzes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // Change Password Handler (Functional)
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setSettingsMessage({ text: 'Passwords do not match.', isError: true });
      return;
    }
    if (newPassword.length < 6) {
      setSettingsMessage({ text: 'Password must be at least 6 characters.', isError: true });
      return;
    }

    setUpdatingPassword(true);
    setSettingsMessage({ text: '', isError: false });

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setSettingsMessage({ text: 'Password updated successfully!', isError: false });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setSettingsMessage({ text: err.message, isError: true });
    } finally {
      setUpdatingPassword(false);
    }
  };

  // Submit Support Ticket Handler (Interactive)
  const handleSupportSubmit = (e) => {
    e.preventDefault();
    if (!supportSubject || !supportMessage) return;

    setSubmittingSupport(true);
    setTimeout(() => {
      setSubmittingSupport(false);
      setSupportTicketSent(true);
      setSupportSubject('');
      setSupportMessage('');
    }, 1200);
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    return `${mins} min${mins > 1 ? 's' : ''}`;
  };

  // Completed quizzes (passing filters)
  const completedQuizzes = quizzes.filter(q => q.status === 'COMPLETED');



  // Get active tab human-readable title
  const getTabTitle = () => {
    switch (activeTab) {
      case 'quizzes': return 'Quizzes';
      case 'courses': return 'Courses';
      case 'certificates': return 'Certifications';
      case 'support': return 'Support Helpdesk';
      case 'settings': return 'Account Settings';
      default: return 'Dashboard';
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation Panel (Dark Slate matching reference design) */}
      <Sidebar 
        profile={profile}
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        handleLogout={handleLogout}
      />

      {/* Main Panel Content (Light Theme blue-grey background matching reference design) */}
      <main className="main-content">
        <Header 
          title={getTabTitle()}
          username={profile?.username}
        />

        {/* Tab Module Rendering */}
        {activeTab === 'quizzes' && (
          <QuizzesModule 
            quizzes={quizzes}
            loading={loading}
            formatDuration={formatDuration}
          />
        )}

        {activeTab === 'courses' && (
          <CoursesModule />
        )}

        {activeTab === 'certificates' && (
          <CertificatesModule />
        )}

        {activeTab === 'support' && (
          <SupportModule 
            supportCategory={supportCategory}
            setSupportCategory={setSupportCategory}
            supportSubject={supportSubject}
            setSupportSubject={setSupportSubject}
            supportMessage={supportMessage}
            setSupportMessage={setSupportMessage}
            submittingSupport={submittingSupport}
            supportTicketSent={supportTicketSent}
            setSupportTicketSent={setSupportTicketSent}
            handleSupportSubmit={handleSupportSubmit}
            userEmail={user?.email}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsModule 
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            updatingPassword={updatingPassword}
            settingsMessage={settingsMessage}
            handleChangePassword={handleChangePassword}
          />
        )}
      </main>

      {/* 3. Certificate Modal (Print/View Overlay) */}
      {selectedCert && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '24px'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '750px',
            background: '#ffffff',
            padding: '48px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            borderRadius: '12px',
            border: '8px double var(--secondary)',
            color: '#1e293b',
            position: 'relative',
            textAlign: 'center'
          }}>
            <div style={{ margin: '0 auto 24px auto', maxWidth: '100px' }}>
              <Shield size={64} style={{ color: 'var(--secondary)' }} />
            </div>
            
            <h1 style={{ fontFamily: 'var(--font-title)', fontSize: '2.5rem', fontWeight: '800', color: 'var(--secondary)', letterSpacing: '0.05em', marginBottom: '8px' }}>
              CERTIFICATE OF PERFORMANCE
            </h1>
            <p style={{ fontStyle: 'italic', fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '32px' }}>
              This document officially certifies that
            </p>

            <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '2.25rem', fontWeight: '700', textDecoration: 'underline', color: '#0f172a', marginBottom: '24px' }}>
              {profile?.username}
            </h2>

            <p style={{ fontSize: '1.05rem', color: '#334155', lineHeight: '1.6', maxWidth: '550px', margin: '0 auto 32px auto' }}>
              has successfully sat for and passed the examination requirements for the course program
            </p>

            <h3 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--primary)', marginBottom: '32px' }}>
              {selectedCert.title}
            </h3>

            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '40px',
              borderTop: '1px solid rgba(0,0,0,0.08)',
              borderBottom: '1px solid rgba(0,0,0,0.08)',
              padding: '16px 0',
              maxWidth: '480px',
              margin: '0 auto 40px auto',
              fontSize: '0.9rem',
              color: 'var(--text-secondary)'
            }}>
              <div>
                <span>Completed: </span>
                <strong style={{ color: '#0f172a' }}>{new Date(selectedCert.registeredAt).toLocaleDateString()}</strong>
              </div>
              <div>
                <span>Verifiable Hash: </span>
                <code style={{ color: 'var(--primary)', fontWeight: '600' }}>CP-{selectedCert.id.substring(0,8).toUpperCase()}</code>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '550px', margin: '0 auto 48px auto' }}>
              <div style={{ textAlign: 'center', width: '200px' }}>
                <div style={{ height: '40px', borderBottom: '1px solid #94a3b8', marginBottom: '8px' }}></div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>CyberPurview Board Director</span>
              </div>
              
              <div style={{ textAlign: 'center', width: '200px' }}>
                <div style={{ height: '40px', borderBottom: '1px solid #94a3b8', marginBottom: '8px' }}></div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Office of the Registrar</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }} className="no-print">
              <button className="btn btn-outline" onClick={() => window.print()} style={{ background: '#f1f5f9', color: '#1e293b' }}>
                <Printer size={16} />
                Print Certificate
              </button>
              <button className="btn btn-primary" onClick={() => setSelectedCert(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
