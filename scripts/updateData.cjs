// scripts/updateData.cjs
//
// This script runs via GitHub Actions or locally. It calls Zafronix API,
// computes the fantasy leaderboard based on the scoring model, and writes
// a single cached JSON file (public/data/leaderboard.json) that the frontend reads.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.API_FOOTBALL_KEY; // Reusing your existing environment key variable name
const BASE_URL = 'https://api.zafronix.com/fifa/worldcup/v1';
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
    // FIX: Changed header from 'x-zafronix-key' to 'X-API-Key'
    headers: { 'X-API-Key': API_KEY } 
  });

  if (!res.ok) {
    throw new Error(`API request failed: ${endpoint} -> ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  
  return json.data !== undefined ? json.data : json;
}

async function getTournaments() {
    const data = await apiGet('/tournaments')
    console.log(data)
}

async function fetchStandings() {
  // Path routing: /tournaments/2026
  const data = await apiGet(`/tournaments/${SEASON}`);
  
  // If they return groups inside the tournament meta, use that.
  // Otherwise fallback to data.groups or an empty array
  return data.tournament?.standings || data.tournament?.groups || data.groups || [];
}

async function fetchAllFixtures() {
  const data = await apiGet(`/tournaments/${SEASON}`);
  
  // Based on standard tournament exports, matches are usually delivered alongside teams
  return data.matches || data.tournament?.matches || [];
}

async function fetchCurrentStatus() {
  try {
    const data = await apiGet(`/tournaments/${SEASON}`);
    return data.tournament?.currentRound || data.tournament?.stage || "Group Stage";
  } catch (e) {
    console.warn('Could not fetch current status:', e.message);
    return "Group Stage";
  }
}

// ----- Scoring computations mapping to React View -----

function computeGroupStageScores(standingsResponse, ownerLookup) {
  const teamPoints = {}; 
  const groupSummaries = [];

  if (!standingsResponse || standingsResponse.length === 0) {
    return { teamPoints, groupSummaries };
  }

  for (const groupBlock of standingsResponse) {
    const groupName = groupBlock.groupName || 'Group';
    const rows = [];

    for (const row of groupBlock.teams) {
      const teamName = normalizeTeamName(row.name);
      const teamId = row.id;
      const owner = ownerLookup[teamName] || null;

      let points = 0;
      const wins = row.wins || 0;
      const draws = row.draws || 0;
      points += wins * POINTS.GROUP_WIN;
      points += draws * POINTS.GROUP_DRAW;

      const played = row.played || 0;
      const isGroupComplete = played >= 3; // 4-team World Cup groups play 3 matches

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
        losses: row.losses || 0,
        goalsDiff: row.goalsDifference || 0,
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
        losses: row.losses || 0,
        goalsDiff: row.goalsDifference || 0,
        points: row.points || 0,
        owner
      });
    }

    groupSummaries.push({ groupName, teams: rows });
  }

  return { teamPoints, groupSummaries };
}

function computeKnockoutScores(fixtures, teamPoints) {
  for (const match of fixtures) {
    const roundName = match.stage;
    if (!roundName || !(roundName in KNOCKOUT_ROUND_POINTS)) continue;

    if (match.status !== 'COMPLETED' && match.status !== 'FT') continue;

    const homeGoals = match.homeScore;
    const awayGoals = match.awayScore;
    
    let winnerId = match.winnerId;
    if (!winnerId && homeGoals !== awayGoals) {
      winnerId = homeGoals > awayGoals ? match.homeTeamId : match.awayTeamId;
    }

    if (!winnerId) continue; 

    const pts = KNOCKOUT_ROUND_POINTS[roundName];

    if (!teamPoints[winnerId]) {
      teamPoints[winnerId] = {
        teamName: normalizeTeamName(match.winnerName),
        teamId: winnerId,
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

    teamPoints[winnerId].knockoutPoints += pts;
    teamPoints[winnerId].totalPoints =
      teamPoints[winnerId].groupPoints + teamPoints[winnerId].knockoutPoints;
  }

  return teamPoints;
}

function buildOwnerLeaderboard(teamPoints) {
  const ownerTotals = {};
  const ownerTeams = {};

  for (const owner of Object.keys(OWNERS)) {
    ownerTotals[owner] = 0;
    ownerTeams[owner] = [];
  }

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
    console.error('API_FOOTBALL_KEY is not configured in your .env variables. Aborting update.');
    return;
  }

  console.log('Connecting to Zafronix API...');

  console.log("verifying tournaments...")
  // await getTournaments();

  console.log('Fetching 2026 World Cup Standings...');
  const standings = await fetchStandings();

  console.log('Fetching 2026 World Cup Matches...');
  const fixtures = await fetchAllFixtures();

  console.log('Fetching current round status...');
  const currentRound = await fetchCurrentStatus();

  const ownerLookup = buildOwnerLookup();

  const { teamPoints, groupSummaries } = computeGroupStageScores(standings, ownerLookup);
  computeKnockoutScores(fixtures, teamPoints);
  const leaderboard = buildOwnerLeaderboard(teamPoints);

  const finished = fixtures.filter(f => f.status === 'COMPLETED' || f.status === 'FT');
  const upcoming = fixtures.filter(f => f.status === 'SCHEDULED' || f.status === 'NS');

  const recentResults = finished
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10)
    .map(f => ({
      date: f.date,
      round: f.stage,
      home: f.homeTeamName,
      away: f.awayTeamName,
      homeGoals: f.homeScore,
      awayGoals: f.awayScore,
      status: f.status
    }));

  const upcomingFixtures = upcoming
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 10)
    .map(f => ({
      date: f.date,
      round: f.stage,
      home: f.homeTeamName,
      away: f.awayTeamName,
      status: f.status
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

  console.log('Data updated successfully using Zafronix Engine.');
}

main().catch(err => {
  console.error('Failed to parse Zafronix structures:', err);
  process.exit(1);
});