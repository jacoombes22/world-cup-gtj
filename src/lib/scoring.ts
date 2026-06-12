export const POINTS = {
  GROUP_DRAW: 0.33,
  GROUP_WIN: 1,
  GROUP_FIRST: 3,
  GROUP_SECOND: 1,
  ROUND_32: 2,
  ROUND_16: 3,
  QUARTERFINAL: 5,
  SEMIFINAL: 8,
  FINAL: 13
};

// Round name strings as returned by API-Football's /fixtures/rounds endpoint
// for league=1 (World Cup), season=2026.
export const ROUND_NAMES = {
  ROUND_32: "Round of 32",
  ROUND_16: "Round of 16",
  QUARTERFINAL: "Quarter-finals",
  SEMIFINAL: "Semi-finals",
  FINAL: "Final"
};

export const KNOCKOUT_POINTS_BY_ROUND: Record<string, number> = {
  [ROUND_NAMES.ROUND_32]: POINTS.ROUND_32,
  [ROUND_NAMES.ROUND_16]: POINTS.ROUND_16,
  [ROUND_NAMES.QUARTERFINAL]: POINTS.QUARTERFINAL,
  [ROUND_NAMES.SEMIFINAL]: POINTS.SEMIFINAL,
  [ROUND_NAMES.FINAL]: POINTS.FINAL
};