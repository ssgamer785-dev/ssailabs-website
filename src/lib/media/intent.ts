/**
 * The `data-prefetch` intent for an in-app destination: a link carrying it
 * has that screen prepared as the member reaches for it (see IntentPrefetch).
 */
export function intentForPath(path: string): string | undefined {
  let url: URL;
  try { url = new URL(path, 'https://app.invalid'); } catch { return undefined; }
  switch (url.pathname) {
    case '/community': return url.searchParams.get('tab') === 'students' ? 'community:students' : 'community';
    case '/post':
    case '/analysis': { const post = url.searchParams.get('post'); return post ? `post:${post}` : undefined; }
    case '/chat/admin': { const conversation = url.searchParams.get('c'); return conversation ? `chat:${conversation}` : 'chat'; }
    case '/chat':
    case '/admin-inbox': return 'chat';
    case '/notifications': return 'notifications';
    case '/admin/activation-codes': return 'admin-codes';
    case '/admin/membership-requests': return 'admin-requests';
    default: return undefined;
  }
}
