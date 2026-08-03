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

    // Fetch all profiles with role 'STUDENT'
    const { data: students, error } = await supabase
      .from('profiles')
      .select('id, username, created_at')
      .eq('role', 'STUDENT')
      .order('username', { ascending: true });

    if (error) throw error;

    return Response.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
