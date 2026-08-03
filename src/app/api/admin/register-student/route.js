import { createServerSideClient } from '@/lib/supabase-server';

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
    const userId = body.userId || body.studentId;
    const { quizId } = body;

    if (!userId || !quizId) {
      return Response.json({ error: 'Missing studentId/userId or quizId' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('quiz_registrations')
      .insert({ user_id: userId, quiz_id: quizId })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique violation in Postgres
        return Response.json({ error: 'Student is already registered for this quiz' }, { status: 400 });
      }
      throw error;
    }

    return Response.json({ success: true, registration: data });
  } catch (error) {
    console.error('Error registering student:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
