/**
 * What a member is about to see, prepared before they open it.
 *
 * Right after sign-in (or a reopened app) the first page of both community
 * channels, the member's chat (the admin's two most recent threads) and the
 * inbox are read; then the pictures the first screen of each will show — every
 * tile of an album card, video posters, the newest chat photos — are signed in
 * one request per kind and fetched and decoded a few at a time, within a data
 * budget. Reaching for a screen (pointer over a link, a finger down on it)
 * does the same for that screen alone, before the tap has even finished.
 *
 * Only what the first screens show is prepared: a few posts per channel and
 * the newest chat messages, never a whole history. Full videos, documents and
 * voice notes are never fetched ahead: their rows are already here, which is
 * all their cards need. On Save-Data or 2G nothing is downloaded at all.
 */
import type { FeedPost } from '../community/useFeed';
import type { ChatMessage } from '../chat/types';
import { isWithheldForAnonymity } from '../community/media-visibility';
import { readView } from '../view-cache';
import { prefetchMedia, prefetchPlan, type PrefetchItem } from './media-cache';

/** Posts per channel prepared ahead: what the first screen shows, and the next one down. */
export const FEED_WINDOW = 4;
/** An album card shows at most four tiles. */
const ALBUM_TILES = 4;
/** Newest messages prepared ahead: the bottom of the thread, where it opens. */
export const CHAT_WINDOW = 10;
/** A screen reached for again within this window is not prepared twice. */
const INTENT_COOLDOWN_MS = 15_000;

/** The pictures a feed's first posts show: photos, video posters, and every visible tile of an album. */
export function feedMediaItems(posts: readonly FeedPost[], count = FEED_WINDOW): PrefetchItem[] {
  const out: PrefetchItem[] = [];
  for (const post of posts.slice(0, count)) {
    if (post.mediaPurged || isWithheldForAnonymity(post)) continue;
    const tiles: { key: string; bytes: number | null }[] = [];
    if (post.attachment === 'image' && post.storageKey) tiles.push({ key: post.storageKey, bytes: post.sizeBytes });
    else if (post.attachment === 'video' && post.posterKey) tiles.push({ key: post.posterKey, bytes: null });
    for (const item of post.extraMedia ?? []) {
      if (item.mediaPurged) continue;
      if (item.kind === 'image' && item.storageKey) tiles.push({ key: item.storageKey, bytes: item.sizeBytes });
      else if (item.kind === 'video' && item.posterKey) tiles.push({ key: item.posterKey, bytes: null });
    }
    for (const tile of tiles.slice(0, ALBUM_TILES)) out.push({ scope: 'post', key: tile.key, bytes: tile.bytes });
  }
  return out;
}

/** The pictures the newest messages of a thread show (photos and video posters), newest first. */
export function chatMediaItems(messages: readonly ChatMessage[], count = CHAT_WINDOW): PrefetchItem[] {
  const out: PrefetchItem[] = [];
  for (const message of [...messages].reverse().slice(0, count)) {
    if (message.mediaPurged || message.deletedAt || message.uploadStatus === 'pending' || message.status !== 'sent') continue;
    if (message.kind === 'image' && message.storageKey) out.push({ scope: 'chat', key: message.storageKey, bytes: message.sizeBytes });
    else if (message.kind === 'video' && message.posterKey) out.push({ scope: 'chat', key: message.posterKey, bytes: message.posterSizeBytes });
  }
  return out;
}

/** First of each list, then second of each…: every screen's top picture is ready before anyone's second. */
export function interleave<T>(...lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some(list => i < list.length); i++) for (const list of lists) if (i < list.length) out.push(list[i]);
  return out;
}

async function feedPages(userId: string, channels: readonly ('official' | 'students')[], reuse: boolean): Promise<FeedPost[][]> {
  const { feedKey, warmFeed } = await import('../community/useFeed');
  return Promise.all(channels.map(async channel => {
    const copy = reuse ? readView<FeedPost[]>(feedKey(userId, channel)) : undefined;
    if (copy) return copy;
    try { return await warmFeed(userId, channel); } catch { return []; }
  }));
}

/** The member's own thread (a student), or the admin's two most recent threads. */
async function chatThreads(userId: string, isAdmin: boolean, reuse: boolean): Promise<ChatMessage[][]> {
  const { threadViewKey, warmConversation } = await import('../chat/useConversation');
  const thread = async (conversationId: string) => {
    const copy = reuse ? readView<ChatMessage[]>(threadViewKey(userId, conversationId)) : undefined;
    if (copy) return copy;
    try { return await warmConversation(userId, conversationId); } catch { return []; }
  };
  if (isAdmin) {
    const { warmAdminConversations } = await import('../chat/useAdminConversations');
    const inbox = reuse ? readView<Awaited<ReturnType<typeof warmAdminConversations>>>(`admin-inbox:${userId}`) ?? await warmAdminConversations(userId)
      : await warmAdminConversations(userId);
    const recent = inbox.filter(c => c.conversationId && c.lastMessageAt)
      .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')).slice(0, 2);
    return Promise.all(recent.map(c => thread(c.conversationId!)));
  }
  const { warmChatOverview } = await import('../chat/useChatOverview');
  const overview = reuse ? readView<Awaited<ReturnType<typeof warmChatOverview>>>(`chat-overview:${userId}`) ?? await warmChatOverview(userId)
    : await warmChatOverview(userId);
  return overview?.conversationId ? [await thread(overview.conversationId)] : [];
}

/** After sign-in or a reopened app: every first screen, read and its pictures prepared. */
export async function warmStartup(userId: string, isAdmin: boolean, signal: AbortSignal): Promise<void> {
  const notes = import('../notifications/useNotifications').then(m => m.warmNotifications(userId)).catch(() => {});
  const [[official, students], threads] = await Promise.all([
    feedPages(userId, ['official', 'students'], false),
    chatThreads(userId, isAdmin, false).catch(() => [] as ChatMessage[][]),
  ]);
  if (signal.aborted) return;
  const lists = [feedMediaItems(official), feedMediaItems(students), ...threads.map(t => chatMediaItems(t))];
  // Start-up preparation steps aside while a screen the member just opened is loading its own pictures.
  // Every screen's top picture is prepared even on a slow link; past those, the budget decides.
  await prefetchMedia(interleave(...lists), { ...prefetchPlan(), yieldToScreens: true, alwaysFirst: lists.filter(l => l.length).length }, signal);
  await notes;
}

const reachedFor = new Map<string, number>();

/**
 * A member is reaching for a screen (`data-prefetch` on the link): prepare
 * that screen alone, from what is already read when it is there.
 * community | community:students | chat | chat:<conversation> | post:<id> | notifications
 */
export async function warmIntent(intent: string, userId: string, isAdmin: boolean): Promise<void> {
  const now = Date.now();
  if (now - (reachedFor.get(intent) ?? 0) < INTENT_COOLDOWN_MS) return;
  reachedFor.set(intent, now);
  // Everything the screen shows is signed in one request; only its top picture is downloaded ahead —
  // the screen loads the rest itself, top first.
  const plan = { ...prefetchPlan(), fetchFirst: 1 };
  if (intent === 'community' || intent === 'community:students') {
    // Only the channel being opened: the other one is start-up preparation's, which steps aside for this screen.
    const [page] = await feedPages(userId, [intent === 'community:students' ? 'students' : 'official'], true);
    await prefetchMedia(feedMediaItems(page), plan);
  } else if (intent === 'chat') {
    const threads = await chatThreads(userId, isAdmin, true);
    await prefetchMedia(interleave(...threads.map(t => chatMediaItems(t))), plan);
  } else if (intent.startsWith('chat:')) {
    const { threadViewKey, warmConversation } = await import('../chat/useConversation');
    const conversationId = intent.slice(5);
    const thread = readView<ChatMessage[]>(threadViewKey(userId, conversationId)) ?? await warmConversation(userId, conversationId).catch(() => []);
    await prefetchMedia(chatMediaItems(thread), plan);
  } else if (intent.startsWith('post:')) {
    const postId = intent.slice(5);
    const { feedKey } = await import('../community/useFeed');
    const post = (['official', 'students'] as const).flatMap(channel => readView<FeedPost[]>(feedKey(userId, channel)) ?? [])
      .find(p => p.id === postId);
    // A post in a feed already read: its pictures, including every tile of its album.
    if (post) await prefetchMedia(feedMediaItems([post], 1), plan);
  } else if (intent === 'notifications') {
    const { warmNotifications } = await import('../notifications/useNotifications');
    if (!readView(`notes:${userId}`)) await warmNotifications(userId).catch(() => {});
  }
}
