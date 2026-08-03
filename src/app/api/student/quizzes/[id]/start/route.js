import { createServerSideClient } from '@/lib/supabase-server';

export async function POST(request, { params }) {
  try {
    const { id: quizId } = await params;

    // User client — used for all authenticated DB requests
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Verify student registration for this quiz (works under RLS select policy)
    const { data: reg, error: regError } = await supabase
      .from('quiz_registrations')
      .select('id, retake_allowed')
      .eq('user_id', user.id)
      .eq('quiz_id', quizId)
      .maybeSingle();

    if (regError || !reg) {
      return Response.json({ error: 'You are not registered for this quiz' }, { status: 403 });
    }

    // 2. Fetch Quiz Details
    const { data: quiz, error: quizError } = await supabase
      .from('quizzes')
      .select('*')
      .eq('id', quizId)
      .single();

    if (quizError || !quiz) {
      return Response.json({ error: 'Quiz not found' }, { status: 404 });
    }

    // 3. Fetch Questions (without correct_option)
    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('id, text, option_a, option_b, option_c, option_d')
      .eq('quiz_id', quizId);

    if (qError) throw qError;

    if (!questions || questions.length === 0) {
      return Response.json({ error: 'Quiz has no questions yet' }, { status: 400 });
    }

    // 4. Check all existing attempts — student SELECT policy is true
    const { data: attempts, error: attError } = await supabase
      .from('quiz_attempts')
      .select('*')
      .eq('user_id', user.id)
      .eq('quiz_id', quizId)
      .order('started_at', { ascending: false });

    if (attError) throw attError;

    const latestAttempt = attempts && attempts.length > 0 ? attempts[0] : null;
    const now = new Date();
    let activeAttempt = null;
    let timeRemaining = quiz.duration;

    if (latestAttempt) {
      const startedAt = new Date(latestAttempt.started_at);
      const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
      const isExpired = elapsedSeconds >= quiz.duration;

      if (!latestAttempt.submitted_at && !isExpired) {
        // Resume active in-progress attempt
        activeAttempt = latestAttempt;
        timeRemaining = quiz.duration - elapsedSeconds;
      }
    }

    if (!activeAttempt) {
      const isFirstAttempt = !latestAttempt;
      const isRetakeAllowed = reg.retake_allowed;

      // Already completed, no retake granted — block cleanly
      if (!isFirstAttempt && !isRetakeAllowed) {
        return Response.json({ completed: true, quizTitle: quiz.title });
      }

      // Create a new attempt (first ever, or admin-granted retake)
      const { data: newAttempt, error: createError } = await supabase
        .from('quiz_attempts')
        .insert({
          user_id: user.id,
          quiz_id: quizId,
          total_questions: questions.length,
          started_at: now.toISOString()
        })
        .select()
        .single();

      if (createError) throw createError;
      activeAttempt = newAttempt;
      timeRemaining = quiz.duration;

      // NOTE: The retake token is consumed automatically in the database trigger consume_retake_token_trigger on insert of quiz_attempts!
    }

    // Fetch saved answers for resume
    const { data: savedAnswers } = await supabase
      .from('quiz_answers')
      .select('question_id, selected_option')
      .eq('attempt_id', activeAttempt.id);

    return Response.json({
      attemptId: activeAttempt.id,
      quizTitle: quiz.title,
      questions,
      duration: quiz.duration,
      timeRemaining,
      savedAnswers: savedAnswers || []
    });
  } catch (error) {
    console.error('Error starting quiz:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
