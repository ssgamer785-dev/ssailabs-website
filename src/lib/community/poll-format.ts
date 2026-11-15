/**
 * How a poll's results are worded. Counts, never percentages: "12 votes" is a
 * number the group can check against itself; the bar behind each option still
 * shows its share at a glance.
 */

/** "0 votes", "1 vote", "12 votes". */
export function voteLabel(count: number): string {
  return `${count} ${count === 1 ? 'vote' : 'votes'}`;
}

/** Everyone votes once per poll, so the total is the number of people who took part. */
export function participantLabel(count: number): string {
  return `${count} ${count === 1 ? 'participant' : 'participants'}`;
}

/** The bar's width in percent of the option row: its share of all votes, 0 when nobody has voted. Drawn, never printed. */
export function barShare(votes: number, total: number): number {
  return total === 0 ? 0 : Math.round((votes / total) * 1000) / 10;
}
