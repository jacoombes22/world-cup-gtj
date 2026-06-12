// scripts/updateData.cjs
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.API_FOOTBALL_KEY; 
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
  'r32': POINTS.ROUND_32,
  'r16': POINTS.ROUND_16,
  'qf': POINTS.QUARTERFINAL,
  'sf': POINTS.SEMIFINAL,
  'final': POINTS.FINAL
};

const OWNERS = {
  Tim: [
    "France",
    "Argentina",
    "Germany",
    "USA",
    "Switzerland",
    "Türkiye",
    "Uruguay",
    "Canada",
    "South Korea",
    "Bosnia and Herzegovina",
    "Senegal",
    "Tunisia",
    "Iran",
    "DR Congo",
    "Saudi Arabia",
    "Iraq"
  ],
  James: [
    "Spain",
    "England",
    "Netherlands",
    "Morocco",
    "Colombia",
    "Ecuador",
    "Croatia",
    "Sweden",
    "Scotland",
    "Paraguay",
    "Algeria",
    "New Zealand",
    "Cabo Verde",
    "Jordan",
    "Uzbekistan",
    "Qatar"
  ],
  Griffin: [
    "Portugal",
    "Brazil",
    "Belgium",
    "Norway",
    "Japan",
    "Mexico",
    "Austria",
    "Ivory Coast",
    "Czechia",
    "Egypt",
    "Ghana",
    "Australia",
    "South Africa",
    "Panama",
    "Haiti",
    "Curacao"
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
  "DRC": "DR Congo",
  "IR Iran": "Iran",

};

function normalizeTeamName(name) {
  if (!name) return "";
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
    headers: { 'X-API-Key': API_KEY } 
  });

  if (!res.ok) {
    throw new Error(`API request failed: ${endpoint} -> ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

// ----- Processing Logic Using Failsafe String Keys -----

function processTournamentData(matches, ownerLookup) {
  const teamPoints = {};
  const groupsData = {};

  // Initialize data frameworks for all drafted teams
  for (const ownerTeams of Object.values(OWNERS)) {
    for (const rawName of ownerTeams) {
      const name = normalizeTeamName(rawName);
      teamPoints[name] = {
        teamName: name,
        owner: ownerLookup[name] || null,
        groupName: "Unknown",
        rank: 0,
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
  }

  // Loop through every single match row
  for (const match of matches) {
    const stage = match.stage || "";
    const homeName = normalizeTeamName(match.homeTeam);
    const awayName = normalizeTeamName(match.awayTeam);
    
    // Skip placeholder data rows ("1A", "W73", etc.)
    const isHomePlaceholder = !homeName || homeName.match(/^\d/) || homeName.startsWith('W');
    const isAwayPlaceholder = !awayName || awayName.match(/^\d/) || awayName.startsWith('W');

    const homeScore = match.homeScore;
    const awayScore = match.awayScore;
    const isPlayed = homeScore !== null && awayScore !== null;

    // A) Process Group Stage Calculations
    if (stage.startsWith('group_')) {
      const groupLetter = stage.split('_')[1]?.toUpperCase() || 'Group';
      const groupName = `Group ${groupLetter}`;

      if (!isHomePlaceholder && teamPoints[homeName]) teamPoints[homeName].groupName = groupName;
      if (!isAwayPlaceholder && teamPoints[awayName]) teamPoints[awayName].groupName = groupName;

      // Initialize group lists
      if (!groupsData[groupName]) groupsData[groupName] = {};
      if (!isHomePlaceholder && !groupsData[groupName][homeName]) groupsData[groupName][homeName] = { wins:0, draws:0, losses:0, played:0, gd:0, pts:0 };
      if (!isAwayPlaceholder && !groupsData[groupName][awayName]) groupsData[groupName][awayName] = { wins:0, draws:0, losses:0, played:0, gd:0, pts:0 };

      if (isPlayed) {
        if (!isHomePlaceholder) {
          groupsData[groupName][homeName].played += 1;
          groupsData[groupName][homeName].gd += (homeScore - awayScore);
        }
        if (!isAwayPlaceholder) {
          groupsData[groupName][awayName].played += 1;
          groupsData[groupName][awayName].gd += (awayScore - homeScore);
        }

        if (homeScore > awayScore) {
          if (!isHomePlaceholder) {
            groupsData[groupName][homeName].wins += 1;
            groupsData[groupName][homeName].pts += 3;
            if (teamPoints[homeName]) teamPoints[homeName].groupPoints += POINTS.GROUP_WIN;
          }
          if (!isAwayPlaceholder) groupsData[groupName][awayName].losses += 1;
        } else if (awayScore > homeScore) {
          if (!isAwayPlaceholder) {
            groupsData[groupName][awayName].wins += 1;
            groupsData[groupName][awayName].pts += 3;
            if (teamPoints[awayName]) teamPoints[awayName].groupPoints += POINTS.GROUP_WIN;
          }
          if (!isHomePlaceholder) groupsData[groupName][homeName].losses += 1;
        } else {
          if (!isHomePlaceholder) {
            groupsData[groupName][homeName].draws += 1;
            groupsData[groupName][homeName].pts += 1;
            if (teamPoints[homeName]) teamPoints[homeName].groupPoints += POINTS.GROUP_DRAW;
          }
          if (!isAwayPlaceholder) {
            groupsData[groupName][awayName].draws += 1;
            groupsData[groupName][awayName].pts += 1;
            if (teamPoints[awayName]) teamPoints[awayName].groupPoints += POINTS.GROUP_DRAW;
          }
        }
      }
    }

    // B) Process Knockout Progression Points
    else if (isPlayed && stage in KNOCKOUT_ROUND_POINTS) {
      let winner = null;
      if (homeScore > awayScore) winner = homeName;
      else if (awayScore > homeScore) winner = awayName;
      else if (match.penalties) {
        // If tied, check penalty winner properties
        winner = match.penalties.homeScore > match.penalties.awayScore ? homeName : awayName;
      }

      if (winner && teamPoints[winner]) {
        teamPoints[winner].knockoutPoints += KNOCKOUT_ROUND_POINTS[stage];
      }
    }
  }

  // Compile calculated Group arrays and apply ranks
  const groupSummaries = [];
  for (const [groupName, teamsMap] of Object.entries(groupsData)) {
    const sortedTeams = Object.entries(teamsMap)
      .map(([name, stats]) => ({
        teamName: name,
        played: stats.played,
        wins: stats.wins,
        draws: stats.draws,
        losses: stats.losses,
        goalsDiff: stats.gd,
        points: stats.pts,
        owner: ownerLookup[name] || null
      }))
      .sort((a, b) => b.points - a.points || b.goalsDiff - a.goalsDiff || a.teamName.localeCompare(b.teamName));

    sortedTeams.forEach((team, index) => {
      const rank = index + 1;
      team.rank = rank;
      
      if (teamPoints[team.teamName]) {
        const tp = teamPoints[team.teamName];
        tp.played = team.played;
        tp.wins = team.wins;
        tp.draws = team.draws;
        tp.losses = team.losses;
        tp.goalsDiff = team.goalsDiff;
        tp.rank = rank;

        // Apply completion bonuses (Top 2 progress in 4-team group variants)
        if (team.played >= 3) {
          if (rank === 1) tp.groupPoints += POINTS.GROUP_FIRST;
          else if (rank === 2) tp.groupPoints += POINTS.GROUP_SECOND;
        }
      }
    });

    groupSummaries.push({ groupName, teams: sortedTeams });
  }

  // Aggregate global totals
  for (const tp of Object.values(teamPoints)) {
    tp.totalPoints = tp.groupPoints + tp.knockoutPoints;
  }

  return { teamPoints, groupSummaries };
}

function buildOwnerLeaderboard(teamPoints) {
  const ownerTotals = {};
  const ownerTeams = {};

  for (const owner of Object.keys(OWNERS)) {
    ownerTotals[owner] = 0;
    ownerTeams[owner] = [];
  }

  for (const tp of Object.values(teamPoints)) {
    if (!tp.owner) continue;
    ownerTeams[tp.owner].push({
      ...tp,
      groupPoints: Math.round(tp.groupPoints * 100) / 100,
      totalPoints: Math.round(tp.totalPoints * 100) / 100
    });
    ownerTotals[tp.owner] += tp.totalPoints;
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
    console.error('API_FOOTBALL_KEY is not configured in your environment context.');
    return;
  }

  console.log('Connecting to Zafronix Engine...');
  console.log(`Fetching matches pipeline data for year: ${SEASON}...`);
  
  // Directly targeting the live /matches stream
  const fixtures = await apiGet('/matches', { year: SEASON });

  console.log(`Successfully pulled down ${fixtures.length || 0} match objects. Processing point maps...`);

  const ownerLookup = buildOwnerLookup();
  const { teamPoints, groupSummaries } = processTournamentData(fixtures, ownerLookup);
  const leaderboard = buildOwnerLeaderboard(teamPoints);

  const finished = fixtures.filter(f => f.homeScore !== null && f.awayScore !== null);
  const upcoming = fixtures.filter(f => f.homeScore === null || f.awayScore === null);

  const recentResults = finished
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10)
    .map(f => ({
      date: f.date,
      round: f.stage,
      home: f.homeTeam,
      away: f.awayTeam,
      homeGoals: f.homeScore,
      awayGoals: f.awayScore,
      status: "FT"
    }));

  const upcomingFixtures = upcoming
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 10)
    .map(f => ({
      date: f.date,
      round: f.stage,
      home: f.homeTeam,
      away: f.awayTeam,
      status: "NS"
    }));

  const output = {
    updatedAt: new Date().toISOString(),
    currentRound: fixtures.find(f => f.homeScore === null)?.stage || "Completed",
    leaderboard,
    groups: groupSummaries.sort((a,b) => a.groupName.localeCompare(b.groupName)),
    recentResults,
    upcomingFixtures
  };

  fs.mkdirSync(path.join('public', 'data'), { recursive: true });
  fs.writeFileSync(
    path.join('public', 'data', 'leaderboard.json'),
    JSON.stringify(output, null, 2)
  );

  console.log('leaderboard.json cache compiled cleanly.');
}

main().catch(err => {
  console.error('Processing Execution Interrupted:', err);
  process.exit(1);
});