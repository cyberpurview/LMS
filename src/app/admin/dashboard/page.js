'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/app/components/AuthProvider';
import { useRouter } from 'next/navigation';

// Modular Dashboard Components (Matching Sleek Design)
import Sidebar from '@/app/components/admin/Sidebar';
import Header from '@/app/components/admin/Header';
import QuizzesModule from '@/app/components/admin/QuizzesModule';
import EnrollModule from '@/app/components/admin/EnrollModule';
import AttemptsModule from '@/app/components/admin/AttemptsModule';

import { Loader2 } from 'lucide-react';

export default function AdminDashboard() {
  const { user, profile, supabase } = useAuth();
  const router = useRouter();
  
  // Dashboard routing states
  const [activeTab, setActiveTab] = useState('quizzes');
  const [quizzes, setQuizzes] = useState([]);
  const [students, setStudents] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Form states
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDuration, setQuizDuration] = useState('');
  const [quizJSON, setQuizJSON] = useState(null);
  const [creatingQuiz, setCreatingQuiz] = useState(false);
  const [quizMessage, setQuizMessage] = useState({ text: '', isError: false });

  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedQuiz, setSelectedQuiz] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerMessage, setRegisterMessage] = useState({ text: '', isError: false });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoadingData(true);
    try {
      const [quizzesRes, studentsRes, attemptsRes] = await Promise.all([
        fetch('/api/admin/quizzes'),
        fetch('/api/admin/students'),
        fetch('/api/admin/attempts')
      ]);

      const [quizzesData, studentsData, attemptsData] = await Promise.all([
        quizzesRes.json(),
        studentsRes.json(),
        attemptsRes.json()
      ]);

      setQuizzes(Array.isArray(quizzesData) ? quizzesData : []);
      setStudents(Array.isArray(studentsData) ? studentsData : []);
      setAttempts(Array.isArray(attemptsData) ? attemptsData : []);
    } catch (err) {
      console.error('Error fetching admin dashboard data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleCreateQuiz = async (e) => {
    e.preventDefault();
    if (!quizJSON) {
      setQuizMessage({ text: 'Please select a questions JSON file.', isError: true });
      return;
    }

    setCreatingQuiz(true);
    setQuizMessage({ text: '', isError: false });

    try {
      const res = await fetch('/api/admin/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: quizTitle,
          duration: parseInt(quizDuration) * 60, // Minutes to seconds
          questions: quizJSON
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create quiz');

      setQuizMessage({ text: 'Quiz created successfully!', isError: false });
      setQuizTitle('');
      setQuizDuration('');
      setQuizJSON(null);
      fetchDashboardData();
    } catch (err) {
      setQuizMessage({ text: err.message, isError: true });
    } finally {
      setCreatingQuiz(false);
    }
  };

  const handleRegisterStudent = async (e) => {
    e.preventDefault();
    if (!selectedStudent || !selectedQuiz) {
      setRegisterMessage({ text: 'Please select both student and quiz.', isError: true });
      return;
    }

    setRegistering(true);
    setRegisterMessage({ text: '', isError: false });

    try {
      const res = await fetch('/api/admin/register-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent,
          quizId: selectedQuiz
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to enroll student');

      setRegisterMessage({ text: 'Student enrolled successfully!', isError: false });
      setSelectedStudent('');
      setSelectedQuiz('');
      fetchDashboardData();
    } catch (err) {
      setRegisterMessage({ text: err.message, isError: true });
    } finally {
      setRegistering(false);
    }
  };

  const handleResetAttempt = async (attemptId) => {
    try {
      const res = await fetch(`/api/admin/attempts?id=${attemptId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset attempt');
      
      fetchDashboardData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case 'quizzes': return 'Practice Exams';
      case 'enroll': return 'Student Enrollments';
      case 'attempts': return 'Exam Attempts Logs';
      default: return 'Dashboard';
    }
  };

  if (loadingData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-app)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Loader2 size={40} className="animate-spin" style={{ margin: '0 auto 16px auto', color: 'var(--primary)' }} />
          <p style={{ fontFamily: 'var(--font-title)', fontWeight: '600' }}>Loading Administrator Portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      {/* Sidebar Nav Component (Dark Theme Matching Reference Design) */}
      <Sidebar 
        profile={profile}
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        handleLogout={handleLogout}
      />

      {/* Main Content Component (Light Theme Soft Blue-Grey Matching Reference Design) */}
      <main className="main-content">
        <Header 
          title={getTabTitle()}
          username={profile?.username}
        />

        {/* Tab Modules Routing */}
        {activeTab === 'quizzes' && (
          <QuizzesModule 
            quizzes={quizzes}
            quizTitle={quizTitle}
            setQuizTitle={setQuizTitle}
            quizDuration={quizDuration}
            setQuizDuration={setQuizDuration}
            creatingQuiz={creatingQuiz}
            quizMessage={quizMessage}
            setQuizMessage={setQuizMessage}
            handleCreateQuiz={handleCreateQuiz}
            setQuizJSON={setQuizJSON}
          />
        )}

        {activeTab === 'enroll' && (
          <EnrollModule 
            students={students}
            quizzes={quizzes}
            selectedStudent={selectedStudent}
            setSelectedStudent={setSelectedStudent}
            selectedQuiz={selectedQuiz}
            setSelectedQuiz={setSelectedQuiz}
            registering={registering}
            registerMessage={registerMessage}
            handleRegisterStudent={handleRegisterStudent}
          />
        )}

        {activeTab === 'attempts' && (
          <AttemptsModule 
            attempts={attempts}
            onResetAttempt={handleResetAttempt}
          />
        )}
      </main>
    </div>
  );
}
