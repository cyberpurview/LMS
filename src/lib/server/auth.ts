import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Role, User } from '@/types'

export async function getIdentity() {
  const client = await createClient()
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) return null
  const { data, error } = await client.from('profiles').select('*').eq('id', user.id).single()
  if (error?.code === 'PGRST116') return null
  if (error)
    throw new Error('Database setup is incomplete. Apply the Supabase migration before signing in.')
  if (!data.is_active) return null
  const profile: User = {
    id: data.id,
    name: data.name,
    email: user.email || '',
    role: data.role,
    avatar: data.avatar || '',
    joinedAt: data.created_at,
    isActive: data.is_active,
  }
  return { client, user: profile, preferences: data.preferences as Record<string, unknown> }
}

export async function requireRole(role: Role) {
  const identity = await getIdentity()
  if (!identity) redirect('/login')
  if (identity.user.role !== role) redirect(`/${identity.user.role}`)
  return identity
}
