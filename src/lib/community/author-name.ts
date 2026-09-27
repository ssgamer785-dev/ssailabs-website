/**
 * Who a post's author is shown as — the one decision two screens (the
 * Community feed and Post Detail) each made separately, and disagreed on.
 *
 * The rule, everywhere: an admin viewer always sees the real name; the author
 * sees exactly what others see on their own post (their current name if it is
 * named, "Unknown User" if it is anonymous); everyone else sees the row's own display_name, which the
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
  /** The post's own persisted anonymity flag — what every other member sees. */
  isAnonymous: boolean;
  /** The database's display_name / author_name for this post (posts_feed / post_by_id). */
  authorName: string;
  /** The signed-in viewer's own current name, from useAppState(). */
  myName: string;
}): string {
  if (args.official) return 'The Traders Planet';

  // Your own post shows what the post really is. It used to follow your
  // current "post with my real name" preference instead, so an author could
  // be told "posting anonymously" while every other member saw their name
  // (and the reverse). A named post shows your current name.
  if (!args.isAdminViewer && args.isMine) return args.isAnonymous ? 'Unknown User' : args.myName;

  return args.isAdminViewer || !args.isAnonymous ? args.authorName : 'Unknown User';
}
