// scripts/updateData.js
//
// This script runs hourly via GitHub Actions. It calls API-Football,
// computes the fantasy leaderboard based on the scoring model, and writes
// a single cached JSON file (public/data/leaderboard.json) that the
// frontend reads. The frontend NEVER calls API-Football directly.

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE_ID = 1; // FIFA World Cup
const SEASON = 2026;

const POINTS = {
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

const KNOCKOUT_ROUND_POINTS = {
  'Round of 32': POINTS.ROUND_32,
  'Round of 16': POINTS.ROUND_16,
  'Quarter-finals': POINTS.QUARTERFINAL,
  'Semi-finals': POINTS.SEMIFINAL,
  'Final': POINTS.FINAL
};

// Order in which knockout rounds are checked, used to find the "latest" round
// a team has won so we award the highest applicable knockout points.
const KNOCKOUT_ROUND_ORDER = [
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Final'
];

const OWNERS = {
  Tim: [
    "France", "Argentina", "Germany", "USA", "Switzerland", "Turkey",
    "Uruguay", "Canada", "South Korea", "Bosnia and Herzegovina",
    "Senegal", "Tunisia", "Iran", "DR Congo", "Saudi Arabia", "Iraq"
  ],
  James: [
    "Spain", "England", "Netherlands", "Morocco", "Colombia", "Ecuador",
    "Sweden", "Scotland", "Paraguay", "Algeria", "New Zealand",
    "Cape Verde", "Uzbekistan", "Qatar"
  ],
  Griffin: [
    "Portugal", "Brazil", "Belgium", "Norway", "Japan", "Mexico",
    "Austria", "Ivory Coast", "Czech Republic", "Egypt", "Ghana",
    "Australia", "South Africa", "Panama", "Haiti", "Curacao"
  ]
};

// Normalize API-Football team names to match our owners list
const TEAM_NAME_ALIASES = {
  "United States": "USA",
  "Korea Republic": "South Korea",
  "Saudi A": "Saudi Arabia",
  "Columbia": "Colombia",
  "Czech": "Czech Republic",
  "Curaçao": "Curacao",
  "Côte d'Ivoire": "Ivory Coast",
  "Congo DR": "DR Congo",
  "DRC": "DR Congo"
};

function normalizeTeamName(name) {
  return TEAM_NAME_ALIASES[name] || name;
}

function buildOwnerLookup() {
  const lookup = {};
  for (const [owner, teams] of Object.entries(OWNERS)) {
    for (const team of teams) {
      lookup[normalizeTeamName(team)] = owner;
    }
  }
  return lookup;
}

async function apiGet(endpoint, params) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': API_KEY }
  });

  if (!res.ok) {
    throw new Error(`API request failed: ${endpoint} -> ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    console.warn(`API returned errors for ${endpoint}:`, JSON.stringify(json.errors));
  }
  return json.response || [];
}

async function fetchStandings() {
  return apiGet('/standings', { league: LEAGUE_ID, season: SEASON });
}

async function fetchAllFixtures() {
  return apiGet('/fixtures', { league: LEAGUE_ID, season: SEASON });
}

async function fetchCurrentRound() {
  try {
    const rounds = await apiGet('/fixtures/rounds', {
      league: LEAGUE_ID,
      season: SEASON,
      current: 'true'
    });
    return rounds[0] || null;
  } catch (e) {
    console.warn('Could not fetch current round:', e.message);
    return null;
  }
}

// ----- Scoring computation -----

function computeGroupStageScores(standingsResponse, ownerLookup) {
  // standingsResponse[0].league.standings is an array of groups (each an array of team rows)
  const teamPoints = {}; // teamId -> { points, name, owner }
  const groupSummaries = [];

  const leagueData = standingsResponse[0];
  if (!leagueData || !leagueData.league || !leagueData.league.standings) {
    return { teamPoints, groupSummaries };
  }

  const groups = leagueData.league.standings;

  for (const group of groups) {
    const groupName = group[0]?.group || 'Group';
    const rows = [];

    for (const row of group) {
      const teamName = normalizeTeamName(row.team.name);
      const teamId = row.team.id;
      const owner = ownerLookup[teamName] || null;

      let points = 0;

      // Group wins
      const wins = row.all?.win || 0;
      const draws = row.all?.draw || 0;
      points += wins * POINTS.GROUP_WIN;
      points += draws * POINTS.GROUP_DRAW;

      // Placement bonus (only after group stage completes - rank reflects standings at any time,
      // but we only award placement bonus once all group games are played)
      const played = row.all?.played || 0;
      const groupComplete = played >= (group.length - 1); // round-robin: each team plays (n-1) games... but for 4-team groups it's 3
      // For World Cup groups of 4, each team plays 3 group games
      const isGroupComplete = played >= 3;

      if (isGroupComplete) {
        if (row.rank === 1) points += POINTS.GROUP_FIRST;
        else if (row.rank === 2) points += POINTS.GROUP_SECOND;
      }

      teamPoints[teamId] = {
        teamName,
        teamId,
        owner,
        groupName,
        rank: row.rank,
        played,
        wins,
        draws,
        losses: row.all?.lose || 0,
        goalsDiff: row.goalsDiff,
        groupPoints: points,
        knockoutPoints: 0,
        totalPoints: points
      };

      rows.push({
        teamName,
        rank: row.rank,
        played,
        wins,
        draws,
        losses: row.all?.lose || 0,
        goalsDiff: row.goalsDiff,
        points: row.points,
        owner
      });
    }

    groupSummaries.push({ groupName, teams: rows });
  }

  return { teamPoints, groupSummaries };
}

function computeKnockoutScores(fixtures, teamPoints) {
  // For each finished knockout fixture, award the winning team points
  // based on the round they won.
  for (const fixture of fixtures) {
    const roundName = fixture.league?.round;
    if (!roundName || !(roundName in KNOCKOUT_ROUND_POINTS)) continue;

    const status = fixture.fixture?.status?.short;
    // FT = full time, AET = after extra time, PEN = penalties - all count as finished
    if (!['FT', 'AET', 'PEN'].includes(status)) continue;

    const homeGoals = fixture.goals?.home;
    const awayGoals = fixture.goals?.away;
    const homeTeam = fixture.teams?.home;
    const awayTeam = fixture.teams?.away;

    let winnerTeam = null;
    if (fixture.teams?.home?.winner === true) winnerTeam = homeTeam;
    else if (fixture.teams?.away?.winner === true) winnerTeam = awayTeam;
    else if (homeGoals !== awayGoals) {
      winnerTeam = homeGoals > awayGoals ? homeTeam : awayTeam;
    }

    if (!winnerTeam) continue; // draw with no determined winner (shouldn't happen in knockouts)

    const teamId = winnerTeam.id;
    const pts = KNOCKOUT_ROUND_POINTS[roundName];

    if (!teamPoints[teamId]) {
      // Team not in our standings map (shouldn't normally happen) - create entry
      teamPoints[teamId] = {
        teamName: normalizeTeamName(winnerTeam.name),
        teamId,
        owner: null,
        groupName: null,
        rank: null,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsDiff: 0,
        groupPoints: 0,
        knockoutPoints: 0,
        totalPoints: 0
      };
    }

    // Award the points for this specific round won (cumulative across rounds)
    teamPoints[teamId].knockoutPoints += pts;
    teamPoints[teamId].totalPoints =
      teamPoints[teamId].groupPoints + teamPoints[teamId].knockoutPoints;

    if (!teamPoints[teamId].owner) {
      teamPoints[teamId].owner = teamPoints[teamId].owner;
    }
  }

  return teamPoints;
}

function buildOwnerLeaderboard(teamPoints, ownerLookup) {
  const ownerTotals = {};
  const ownerTeams = {};

  // Initialize all owners with their full roster (even teams with 0 points / not yet in standings)
  for (const owner of Object.keys(OWNERS)) {
    ownerTotals[owner] = 0;
    ownerTeams[owner] = [];
  }

  // Seed every drafted team with a zero entry so unstarted/unmatched teams still show
  const seenTeamNames = new Set();
  for (const tp of Object.values(teamPoints)) {
    if (!tp.owner) continue;
    seenTeamNames.add(tp.teamName);
    ownerTeams[tp.owner].push({
      teamName: tp.teamName,
      groupName: tp.groupName,
      rank: tp.rank,
      played: tp.played,
      wins: tp.wins,
      draws: tp.draws,
      losses: tp.losses,
      goalsDiff: tp.goalsDiff,
      groupPoints: Math.round(tp.groupPoints * 100) / 100,
      knockoutPoints: tp.knockoutPoints,
      totalPoints: Math.round(tp.totalPoints * 100) / 100
    });
    ownerTotals[tp.owner] += tp.totalPoints;
  }

  // Add any drafted teams not yet found in API data (e.g. groups not started)
  for (const [owner, teams] of Object.entries(OWNERS)) {
    for (const team of teams) {
      const normalized = normalizeTeamName(team);
      if (!seenTeamNames.has(normalized)) {
        ownerTeams[owner].push({
          teamName: normalized,
          groupName: null,
          rank: null,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsDiff: 0,
          groupPoints: 0,
          knockoutPoints: 0,
          totalPoints: 0
        });
      }
    }
  }

  const leaderboard = Object.entries(ownerTotals)
    .map(([owner, total]) => ({
      owner,
      totalPoints: Math.round(total * 100) / 100,
      teams: ownerTeams[owner].sort((a, b) => b.totalPoints - a.totalPoints)
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);

  return leaderboard;
}

async function main() {
  if (!API_KEY) {
    console.error('API_FOOTBALL_KEY is not set. Writing placeholder data.');
    const placeholder = {
      updatedAt: new Date().toISOString(),
      error: 'API_FOOTBALL_KEY not configured',
      leaderboard: [],
      groups: [],
      currentRound: null
    };
    fs.writeFileSync(
      path.join('public', 'data', 'leaderboard.json'),
      JSON.stringify(placeholder, null, 2)
    );
    return;
  }

  console.log('Fetching standings...');
  const standings = await fetchStandings();

  console.log('Fetching fixtures...');
  const fixtures = await fetchAllFixtures();

  console.log('Fetching current round...');
  const currentRound = await fetchCurrentRound();

  const ownerLookup = buildOwnerLookup();

  const { teamPoints, groupSummaries } = computeGroupStageScores(standings, ownerLookup);
  computeKnockoutScores(fixtures, teamPoints);
  const leaderboard = buildOwnerLeaderboard(teamPoints, ownerLookup);

  // Upcoming / recent fixtures for display (next 10 not finished, last 10 finished)
  const finished = fixtures.filter(f => ['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short));
  const upcoming = fixtures.filter(f => ['NS', 'TBD'].includes(f.fixture?.status?.short));

  const recentResults = finished
    .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date))
    .slice(0, 10)
    .map(f => ({
      date: f.fixture.date,
      round: f.league.round,
      home: f.teams.home.name,
      away: f.teams.away.name,
      homeGoals: f.goals.home,
      awayGoals: f.goals.away,
      status: f.fixture.status.short
    }));

  const upcomingFixtures = upcoming
    .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
    .slice(0, 10)
    .map(f => ({
      date: f.fixture.date,
      round: f.league.round,
      home: f.teams.home.name,
      away: f.teams.away.name,
      status: f.fixture.status.short
    }));

  const output = {
    updatedAt: new Date().toISOString(),
    currentRound: currentRound,
    leaderboard,
    groups: groupSummaries,
    recentResults,
    upcomingFixtures
  };

  fs.mkdirSync(path.join('public', 'data'), { recursive: true });
  fs.writeFileSync(
    path.join('public', 'data', 'leaderboard.json'),
    JSON.stringify(output, null, 2)
  );

  console.log('Data updated successfully.');
}

main().catch(err => {
  console.error('Failed to update data:', err);
  process.exit(1);
});