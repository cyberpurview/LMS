import { createServerSideClient } from '@/lib/supabase-server';

export async function POST(request, { params }) {
  try {
    const { id: quizId } = await params;
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { questionId, selectedOption } = body;

    if (!questionId) {
      return Response.json({ error: 'Missing questionId' }, { status: 400 });
    }

    // 1. Fetch active (latest unsubmitted) attempt
    const { data: attempts, error: attError } = await supabase
      .from('quiz_attempts')
      .select('*, quizzes(duration)')
      .eq('user_id', user.id)
      .eq('quiz_id', quizId)
      .is('submitted_at', null)
      .order('started_at', { ascending: false })
      .limit(1);

    if (attError || !attempts || attempts.length === 0) {
      return Response.json({ error: 'No active attempt found' }, { status: 404 });
    }

    const attempt = attempts[0];


    // 2. Validate time limit
    const now = new Date();
    const startedAt = new Date(attempt.started_at);
    const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
    const isExpired = elapsedSeconds >= attempt.quizzes.duration;

    if (isExpired) {
      return Response.json({ error: 'Quiz time has elapsed' }, { status: 400 });
    }

    // 3. Upsert answer (update if already answered, insert if new)
    const { error: upsertError } = await supabase
      .from('quiz_answers')
      .upsert({
        attempt_id: attempt.id,
        question_id: questionId,
        selected_option: selectedOption
      }, { onConflict: 'attempt_id,question_id' });

    if (upsertError) throw upsertError;

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error saving answer:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
