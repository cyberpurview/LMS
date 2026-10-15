import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getIdentity } from '@/lib/server/auth'
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' }
  try {
    const identity = await getIdentity()
    if (!identity) return NextResponse.json({ error: 'Please sign in' }, { status: 401, headers })
    const time = request.nextUrl.searchParams.get('beforeTime')
    const id = request.nextUrl.searchParams.get('beforeId')
    if (!!time !== !!id) throw new Error('Invalid notification cursor')
    const { data, error } = await identity.client.rpc('notification_feed', {
      before_time: time ? z.iso.datetime({ offset: true }).parse(time) : undefined,
      before_id: id ? z.string().uuid().parse(id) : undefined,
      unread_only: request.nextUrl.searchParams.get('unread') === 'true',
    })
    if (error) throw new Error(error.message)
    const feed = data as { notifications: Record<string, unknown>[]; unreadCount: number }
    return NextResponse.json(
      {
        notifications: feed.notifications.slice(0, 50).map((n) => ({
          id: n.id,
          userId: n.user_id,
          title: n.title,
          message: n.message,
          type: n.type,
          isRead: n.is_read,
          createdAt: n.created_at,
          href: n.href,
          eventKey: n.event_key,
        })),
        unreadCount: feed.unreadCount,
        completionSound: identity.preferences?.aiCompletionSound === true,
        hasMore: feed.notifications.length > 50,
      },
      { headers },
    )
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unable to load notifications' },
      { status: 400, headers },
    )
  }
}
