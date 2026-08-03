import { createServerSideClient } from '@/lib/supabase-server';

export async function GET(request, { params }) {
  try {
    const { attemptId } = await params;
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the requester is an admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch the attempt (with quiz + student profile)
    const { data: attempt, error: attError } = await supabase
      .from('quiz_attempts')
      .select('*, quizzes(*), profiles!quiz_attempts_user_id_fkey(username, id)')
      .eq('id', attemptId)
      .single();

    if (attError || !attempt) {
      return Response.json({ error: 'Attempt not found' }, { status: 404 });
    }

    if (!attempt.submitted_at) {
      return Response.json({ error: 'This attempt has not been submitted yet' }, { status: 400 });
    }

    // Fetch questions for this quiz
    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('*')
      .eq('quiz_id', attempt.quiz_id);

    if (qError) throw qError;

    // Fetch answers for this attempt
    const { data: answers, error: ansError } = await supabase
      .from('quiz_answers')
      .select('*')
      .eq('attempt_id', attemptId);

    if (ansError) throw ansError;

    return Response.json({
      quizTitle: attempt.quizzes.title,
      studentName: attempt.profiles?.username || 'Unknown Student',
      score: attempt.score,
      totalQuestions: attempt.total_questions,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
      questions,
      answers,
    });
  } catch (error) {
    console.error('Error fetching admin attempt review:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
