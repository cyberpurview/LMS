import { createServerSideClient } from '@/lib/supabase-server';

export async function GET(request) {
  try {
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = user.user_metadata?.role || 'STUDENT';
    if (role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all quiz attempts with student profiles and quiz titles
    const { data: attempts, error } = await supabase
      .from('quiz_attempts')
      .select('*, profiles(username), quizzes(title)')
      .order('started_at', { ascending: false });

    if (error) throw error;

    const formatted = attempts.map(att => ({
      id: att.id,
      studentName: att.profiles?.username || 'Unknown Student',
      quizTitle: att.quizzes?.title || 'Unknown Quiz',
      score: att.score,
      totalQuestions: att.total_questions,
      startedAt: att.started_at,
      submittedAt: att.submitted_at,
      status: att.submitted_at ? 'COMPLETED' : 'IN_PROGRESS'
    }));

    return Response.json(formatted);
  } catch (error) {
    console.error('Error fetching admin attempts:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = user.user_metadata?.role || 'STUDENT';
    if (role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const attemptId = searchParams.get('id');

    if (!attemptId) {
      return Response.json({ error: 'Attempt ID is required' }, { status: 400 });
    }

    // 1. Fetch the attempt to get user_id and quiz_id
    const { data: attempt, error: fetchError } = await supabase
      .from('quiz_attempts')
      .select('user_id, quiz_id')
      .eq('id', attemptId)
      .single();

    if (fetchError || !attempt) {
      return Response.json({ error: 'Attempt not found' }, { status: 404 });
    }

    // 2. Set retake_allowed to true in quiz_registrations for this user and quiz
    const { error: updateError } = await supabase
      .from('quiz_registrations')
      .update({ retake_allowed: true })
      .eq('user_id', attempt.user_id)
      .eq('quiz_id', attempt.quiz_id);

    if (updateError) throw updateError;

    return Response.json({ message: 'Retake allowed successfully' });
  } catch (error) {
    console.error('Error resetting attempt:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
