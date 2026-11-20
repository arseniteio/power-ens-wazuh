export interface ENSTally {
  met: number;
  total: number;
  percent: number;
  level?: number;
}

const percentOf = (met: number, total: number): number => Math.floor((met * 100) / total);

export const sumTallies = (tallies: (ENSTally | undefined)[]): ENSTally | undefined => {
  const counted = tallies.filter((tally): tally is ENSTally => Boolean(tally && tally.total > 0));
  if (!counted.length) return undefined;
  if (counted.length === 1) return counted[0];
  // The engine sets the level per machine with that machine's scale; a sum over machines has
  // no scale of its own, so it carries the count and percent only.
  const met = counted.reduce((sum, tally) => sum + tally.met, 0);
  const total = counted.reduce((sum, tally) => sum + tally.total, 0);
  return { met, total, percent: percentOf(met, total) };
};

export const formatTally = (tally: ENSTally): string =>
  [`${tally.met}/${tally.total}`, `${tally.percent} %`, tally.level === undefined ? undefined : `L${tally.level}`]
    .filter(Boolean)
    .join(' · ');
