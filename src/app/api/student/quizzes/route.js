import { createServerSideClient } from '@/lib/supabase-server';

export async function GET(request) {
  try {
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Get quizzes student is registered for
    const { data: registrations, error: regError } = await supabase
      .from('quiz_registrations')
      .select('*, quizzes(*)')
      .eq('user_id', user.id);

    if (regError) throw regError;

    if (!registrations || registrations.length === 0) {
      return Response.json([]);
    }

    const quizIds = registrations.map(r => r.quiz_id);

    // 2. Fetch all attempts for these quizzes by this student
    const { data: attempts, error: attError } = await supabase
      .from('quiz_attempts')
      .select('*')
      .eq('user_id', user.id)
      .in('quiz_id', quizIds);

    if (attError) throw attError;

    // 3. Map registrations with attempts & calculate current status
    const now = new Date();
    const quizStatuses = registrations.map(reg => {
      const quiz = reg.quizzes;
      
      // Get all attempts for this quiz, sorted latest first
      const quizAttempts = attempts
        .filter(a => a.quiz_id === quiz.id)
        .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));

      const latestAttempt = quizAttempts[0];

      let status = 'NOT_STARTED';
      let score = null;
      let timeRemaining = null;
      let attemptId = null;

      if (latestAttempt) {
        attemptId = latestAttempt.id;
        const startedAt = new Date(latestAttempt.started_at);
        const durationInMs = quiz.duration * 1000;
        const elapsedInMs = now.getTime() - startedAt.getTime();
        const hasTimeRemaining = elapsedInMs < durationInMs;

        if (latestAttempt.submitted_at) {
          status = 'COMPLETED';
          score = latestAttempt.score;
        } else if (hasTimeRemaining) {
          status = 'IN_PROGRESS';
          timeRemaining = Math.max(0, Math.floor((durationInMs - elapsedInMs) / 1000));
        } else {
          status = 'COMPLETED'; // Elapsed but not explicitly submitted (treated as completed/expired)
          score = latestAttempt.score;
        }
      }

      return {
        id: quiz.id,
        title: quiz.title,
        duration: quiz.duration, // in seconds
        status,
        score,
        timeRemaining,
        attemptId,
        retakeAllowed: reg.retake_allowed,
        registeredAt: reg.created_at,
        attempts: quizAttempts.map(att => ({
          id: att.id,
          score: att.score,
          startedAt: att.started_at,
          submittedAt: att.submitted_at
        }))
      };
    });

    return Response.json(quizStatuses);
  } catch (error) {
    console.error('Error fetching student quizzes:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
