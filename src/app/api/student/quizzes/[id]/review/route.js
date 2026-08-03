import { createServerSideClient } from '@/lib/supabase-server';
import { randomUUID } from 'crypto';

export async function GET(request, { params }) {
  try {
    const { id: quizId } = await params;
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const attemptId = searchParams.get('attemptId');

    let attempt = null;
    let attError = null;

    if (attemptId) {
      const { data, error } = await supabase
        .from('quiz_attempts')
        .select('*, quizzes(*)')
        .eq('id', attemptId)
        .single();
      attempt = data;
      attError = error;
    } else {
      const { data, error } = await supabase
        .from('quiz_attempts')
        .select('*, quizzes(*)')
        .eq('user_id', user.id)
        .eq('quiz_id', quizId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      attempt = data;
      attError = error;
    }

    if (attError || !attempt) {
      return Response.json({ error: 'No quiz attempt found' }, { status: 404 });
    }

    const now = new Date();
    const startedAt = new Date(attempt.started_at);
    const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
    const isExpired = elapsedSeconds >= attempt.quizzes.duration;

    // 2. Auto-submit if expired and not yet submitted
    if (!attempt.submitted_at && isExpired) {
      // Evaluate and submit
      const { data: questions } = await supabase
        .from('questions')
        .select('id, correct_option')
        .eq('quiz_id', quizId);

      const { data: savedAnswers } = await supabase
        .from('quiz_answers')
        .select('*')
        .eq('attempt_id', attempt.id);

      let score = 0;
      const evaluatedAnswers = questions.map(q => {
        const saved = savedAnswers?.find(sa => sa.question_id === q.id);
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

      await supabase.from('quiz_answers').upsert(evaluatedAnswers);
      
      const { data: updatedAttempt } = await supabase
        .from('quiz_attempts')
        .update({ score, submitted_at: now.toISOString() })
        .eq('id', attempt.id)
        .select('*, quizzes(*)')
        .single();

      attempt = updatedAttempt;
    }

    if (!attempt.submitted_at) {
      return Response.json({ error: 'Quiz has not been submitted yet' }, { status: 400 });
    }

    // 3. Fetch questions (with correct options for review)
    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId);

    if (qError) throw qError;

    // 4. Fetch answers
    const { data: answers, error: ansError } = await supabase
      .from('quiz_answers')
      .select('*')
      .eq('attempt_id', attempt.id);

    if (ansError) throw ansError;

    return Response.json({
      quizTitle: attempt.quizzes.title,
      score: attempt.score,
      totalQuestions: attempt.total_questions,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
      questions,
      answers
    });
  } catch (error) {
    console.error('Error fetching quiz review:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
