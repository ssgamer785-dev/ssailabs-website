/**
 * Who a post's author is shown as — the one decision two screens (the
 * Community feed and Post Detail) each made separately, and disagreed on.
 *
 * The rule, everywhere: an admin viewer always sees the real name; the author
 * always sees their own current name on their own post when their reveal
 * toggle is on; everyone else sees the row's own display_name, which the
 * database has already resolved (the real name if the post was posted
 * revealed, "Unknown User" if it was posted anonymously).
 *
 * The bug this replaces was subtle: both screens correctly decided WHETHER to
 * reveal a name, but then displayed `authorName` — the database's display_name
 * snapshot — even in the "it's your own post" branch. That snapshot is
 * deliberately frozen at post time, so an anonymously-posted post kept
 * showing "Unknown User" to its own author forever, even after they later
 * turned their name-visibility toggle on. What "you always see your own" has
 * to mean is your CURRENT name, not the frozen snapshot everyone else sees —
 * which is exactly what `myName` supplies here and `authorName` cannot.
 */
export function resolveAuthorName(args: {
  /** Official-channel posts always read as the platform, never a person. */
  official: boolean;
  /** Whether the person looking at this IS an admin — not the author. */
  isAdminViewer: boolean;
  /** Whether the person looking at this wrote the post. */
  isMine: boolean;
  /** The viewer's OWN current name-visibility toggle, from useAppState(). */
  reveal: boolean;
  /** The post's own persisted anonymity flag. */
  isAnonymous: boolean;
  /** The database's display_name / author_name for this post (posts_feed / post_by_id). */
  authorName: string;
  /** The signed-in viewer's own current name, from useAppState(). */
  myName: string;
}): string {
  if (args.official) return 'The Traders Planet';

  // Your own post, shown revealed right now: your current name, never the
  // frozen row snapshot. Admins are excluded because they already receive the
  // live real name in `authorName` regardless of anonymity (posts_feed /
  // post_by_id resolve it server-side for them), so there is nothing to
  // override — using `myName` there would just be a longer way to the exact
  // same value, and would stop matching `authorName` if the two ever drifted.
  if (!args.isAdminViewer && args.isMine && args.reveal) return args.myName;

  const showRealName = args.isAdminViewer || (args.isMine && args.reveal) || !args.isAnonymous;
  return showRealName ? args.authorName : 'Unknown User';
}
