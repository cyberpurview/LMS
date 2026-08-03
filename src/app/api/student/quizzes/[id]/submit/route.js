import { createServerSideClient } from '@/lib/supabase-server';
import { randomUUID } from 'crypto';

export async function POST(request, { params }) {
  try {
    const { id: quizId } = await params;
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch latest unsubmitted attempt
    const { data: attempts, error: attError } = await supabase
      .from('quiz_attempts')
      .select('*')
      .eq('user_id', user.id)
      .eq('quiz_id', quizId)
      .is('submitted_at', null)
      .order('started_at', { ascending: false })
      .limit(1);

    if (attError || !attempts || attempts.length === 0) {
      return Response.json({ error: 'No active attempt found' }, { status: 404 });
    }

    const attempt = attempts[0];


    // 2. Fetch all questions with correct answers
    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('id, correct_option')
      .eq('quiz_id', quizId);

    if (qError) throw qError;

    // 3. Fetch all saved answers
    const { data: savedAnswers, error: answersError } = await supabase
      .from('quiz_answers')
      .select('*')
      .eq('attempt_id', attempt.id);

    if (answersError) throw answersError;

    // 4. Evaluate each question
    let score = 0;
    const evaluatedAnswers = questions.map(q => {
      const saved = savedAnswers.find(sa => sa.question_id === q.id);
      const selected = saved ? saved.selected_option : null;
      const isCorrect = selected === q.correct_option;

      if (isCorrect) score++;

      return {
        id: saved?.id || randomUUID(),
        attempt_id: attempt.id,
        question_id: q.id,
        selected_option: selected,
        is_correct: isCorrect
      };
    });

    // 5. Bulk upsert evaluated answers back to DB
    const { error: upsertError } = await supabase
      .from('quiz_answers')
      .upsert(evaluatedAnswers);

    if (upsertError) throw upsertError;

    // 6. Update attempt as submitted
    const { data: updatedAttempt, error: updateError } = await supabase
      .from('quiz_attempts')
      .update({
        score,
        submitted_at: new Date().toISOString()
      })
      .eq('id', attempt.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return Response.json({
      success: true,
      score: updatedAttempt.score,
      totalQuestions: updatedAttempt.total_questions,
      submittedAt: updatedAttempt.submitted_at
    });
  } catch (error) {
    console.error('Error submitting quiz:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
