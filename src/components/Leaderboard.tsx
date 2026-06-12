import { useEffect, useState } from 'react';

interface TeamEntry {
  teamName: string;
  groupName: string | null;
  rank: number | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsDiff: number;
  groupPoints: number;
  knockoutPoints: number;
  totalPoints: number;
}

interface OwnerEntry {
  owner: string;
  totalPoints: number;
  teams: TeamEntry[];
}

interface GroupTeamRow {
  teamName: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsDiff: number;
  points: number;
  owner: string | null;
}

interface GroupSummary {
  groupName: string;
  teams: GroupTeamRow[];
}

interface FixtureEntry {
  date: string;
  round: string;
  home: string;
  away: string;
  homeGoals?: number | null;
  awayGoals?: number | null;
  status: string;
}

interface LeaderboardData {
  updatedAt: string;
  currentRound: string | null;
  leaderboard: OwnerEntry[];
  groups: GroupSummary[];
  recentResults: FixtureEntry[];
  upcomingFixtures: FixtureEntry[];
  error?: string;
}

const OWNER_ORDER = ['Tim', 'James', 'Griffin'];

function formatPoints(n: number): string {
  // Show up to 2 decimals, trimming trailing zeros, but keep at least 1 digit
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatUpdatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

function formatFixtureDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

export default function Leaderboard() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openOwners, setOpenOwners] = useState<Record<string, boolean>>({
    Tim: true,
    James: true,
    Griffin: true
  });

  useEffect(() => {
    fetch('data/leaderboard.json')
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
        return res.json();
      })
      .then(setData)
      .catch(err => setLoadError(err.message));
  }, []);

  function toggleOwner(owner: string) {
    setOpenOwners(prev => ({ ...prev, [owner]: !prev[owner] }));
  }

  if (loadError) {
    return (
      <div className="error-banner">
        Couldn&apos;t load leaderboard data: {loadError}. The hourly update job may not
        have run yet.
      </div>
    );
  }

  if (!data) {
    return <div className="empty-state">Loading scoreboard&hellip;</div>;
  }

  const sortedLeaderboard = [...data.leaderboard].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return OWNER_ORDER.indexOf(a.owner) - OWNER_ORDER.indexOf(b.owner);
  });

  return (
    <div>
      <div className="status-row">
        <span>
          Updated: <strong>{formatUpdatedAt(data.updatedAt)}</strong>
        </span>
        {data.currentRound && (
          <span>
            Current round: <strong>{data.currentRound}</strong>
          </span>
        )}
      </div>

      {data.error && (
        <div className="error-banner">
          Data feed issue: {data.error}. Showing last available data.
        </div>
      )}

      <h2 className="section-heading">Standings</h2>
      <div className="standings">
        {sortedLeaderboard.map((entry, idx) => (
          <div className="owner-card" key={entry.owner}>
            <div
              className="owner-card__header"
              role="button"
              tabIndex={0}
              onClick={() => toggleOwner(entry.owner)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') toggleOwner(entry.owner);
              }}
            >
              <div className="owner-card__rank">{idx + 1}</div>
              <div className="owner-card__name">{entry.owner}</div>
              <div className="owner-card__points">
                {formatPoints(entry.totalPoints)}
                <span>pts</span>
              </div>
              <div className={`owner-card__toggle ${openOwners[entry.owner] ? 'is-open' : ''}`}>
                &#9660;
              </div>
            </div>
            {openOwners[entry.owner] && (
              <div className="owner-card__body">
                {entry.teams.map(team => (
                  <div className="team-row" key={team.teamName}>
                    <div className="team-row__name">{team.teamName}</div>
                    <div className="team-row__group">
                      {team.groupName ? (
                        <>
                          {team.groupName}
                          {team.rank && (
                            <span
                              className={`rank-pill ${team.rank <= 2 ? 'rank-pill--gold' : ''}`}
                              style={{ marginLeft: '0.4rem' }}
                            >
                              {team.rank === 1 ? '1st' : team.rank === 2 ? '2nd' : `${team.rank}th`}
                            </span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </div>
                    <div className="team-row__record">
                      {team.played > 0
                        ? `${team.wins}W ${team.draws}D ${team.losses}L`
                        : 'Not started'}
                    </div>
                    <div className="team-row__points">
                      {formatPoints(team.totalPoints)}
                      {(team.groupPoints > 0 || team.knockoutPoints > 0) && (
                        <span className="breakdown">
                          {team.groupPoints > 0 && `grp ${formatPoints(team.groupPoints)}`}
                          {team.groupPoints > 0 && team.knockoutPoints > 0 && ' + '}
                          {team.knockoutPoints > 0 && `KO ${formatPoints(team.knockoutPoints)}`}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {data.groups.length > 0 && (
        <>
          <h2 className="section-heading">Group Stage</h2>
          <div className="groups-grid">
            {data.groups.map(group => (
              <div className="group-card" key={group.groupName}>
                <div className="group-card__header">{group.groupName}</div>
                <table className="group-table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Owner</th>
                      <th className="num">P</th>
                      <th className="num">W</th>
                      <th className="num">D</th>
                      <th className="num">L</th>
                      <th className="num">GD</th>
                      <th className="num">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.teams.map(team => (
                      <tr key={team.teamName} className={(team.rank && team.rank <= 2) ? 'qualified' : ''}>
                        <td className="team-name">{team.teamName}</td>
                        <td className="owner-tag">{team.owner || '—'}</td>
                        <td className="num">{team.played}</td>
                        <td className="num">{team.wins}</td>
                        <td className="num">{team.draws}</td>
                        <td className="num">{team.losses}</td>
                        <td className="num">{team.goalsDiff > 0 ? `+${team.goalsDiff}` : team.goalsDiff}</td>
                        <td className="num">{team.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="section-heading">Fixtures</h2>
      <div className="fixtures-columns">
        <div>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(16,32,25,0.5)', marginBottom: '0.5rem' }}>
            Recent Results
          </h3>
          <div className="fixture-list">
            {data.recentResults.length === 0 && (
              <div className="empty-state">No completed matches yet.</div>
            )}
            {data.recentResults.map((f, i) => (
              <div className="fixture-row" key={i}>
                <div className="fixture-row__teams">
                  <div className="fixture-row__team">
                    <span>{f.home}</span>
                    <span className="fixture-row__score">{f.homeGoals}</span>
                  </div>
                  <div className="fixture-row__team">
                    <span>{f.away}</span>
                    <span className="fixture-row__score">{f.awayGoals}</span>
                  </div>
                </div>
                <div className="fixture-row__meta">{f.round}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(16,32,25,0.5)', marginBottom: '0.5rem' }}>
            Upcoming
          </h3>
          <div className="fixture-list">
            {data.upcomingFixtures.length === 0 && (
              <div className="empty-state">No upcoming matches scheduled.</div>
            )}
            {data.upcomingFixtures.map((f, i) => (
              <div className="fixture-row" key={i}>
                <div className="fixture-row__teams">
                  <div className="fixture-row__team">
                    <span>{f.home}</span>
                  </div>
                  <div className="fixture-row__team">
                    <span>{f.away}</span>
                  </div>
                </div>
                <div className="fixture-row__meta">
                  {formatFixtureDate(f.date)}
                  <br />
                  {f.round}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}