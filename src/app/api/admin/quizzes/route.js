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

    const { data: quizzes, error } = await supabase
      .from('quizzes')
      .select('*, questions(count)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Format count
    const formatted = quizzes.map(q => ({
      ...q,
      questionsCount: q.questions?.[0]?.count || 0
    }));

    return Response.json(formatted);
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
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

    const body = await request.json();
    const { title, duration, questions } = body; // duration is in minutes in frontend, let's store in seconds

    if (!title || !duration || !questions || !Array.isArray(questions)) {
      return Response.json({ error: 'Invalid request parameters' }, { status: 400 });
    }

    const durationInSeconds = parseInt(duration) * 60;

    // 1. Insert Quiz
    const { data: quizData, error: quizError } = await supabase
      .from('quizzes')
      .insert({ title, duration: durationInSeconds })
      .select()
      .single();

    if (quizError) throw quizError;

    // 2. Insert Questions
    const questionsToInsert = questions.map(q => ({
      quiz_id: quizData.id,
      text: q.text,
      option_a: q.optionA || q.option_a,
      option_b: q.optionB || q.option_b,
      option_c: q.optionC || q.option_c,
      option_d: q.optionD || q.option_d,
      correct_option: q.correctOption || q.correct_option,
    }));

    const { error: questionsError } = await supabase
      .from('questions')
      .insert(questionsToInsert);

    if (questionsError) {
      // Cleanup created quiz if question insertion fails
      await supabase.from('quizzes').delete().eq('id', quizData.id);
      throw questionsError;
    }

    return Response.json({ success: true, quizId: quizData.id });
  } catch (error) {
    console.error('Error creating quiz:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
