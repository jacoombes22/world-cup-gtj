export const OWNERS: Record<string, string[]> = {
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

// Map team display names to a normalized key for matching API-Football team names
// (API-Football sometimes uses slightly different naming, e.g. "USA" vs "United States")
export const TEAM_NAME_ALIASES: Record<string, string> = {
  "USA": "USA",
  "United States": "USA",
  "South Korea": "South Korea",
  "Korea Republic": "South Korea",
  "Bosnia and Herzegovina": "Bosnia and Herzegovina",
  "Saudi Arabia": "Saudi Arabia",
  "Saudi A": "Saudi Arabia",
  "Columbia": "Colombia",
  "Colombia": "Colombia",
  "Czech": "Czech Republic",
  "Czech Republic": "Czech Republic",
  "Curaçao": "Curacao",
  "Curacao": "Curacao",
  "Ivory Coast": "Ivory Coast",
  "Côte d'Ivoire": "Ivory Coast",
  "DR Congo": "DR Congo",
  "DRC": "DR Congo",
  "Congo DR": "DR Congo"
};

export function normalizeTeamName(name: string): string {
  return TEAM_NAME_ALIASES[name] || name;
}

// Build a reverse lookup: normalized team name -> owner
export function buildOwnerLookup(): Record<string, string> {
  const lookup: Record<string, string> = {};
  for (const [owner, teams] of Object.entries(OWNERS)) {
    for (const team of teams) {
      lookup[normalizeTeamName(team)] = owner;
    }
  }
  return lookup;
}