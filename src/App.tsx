import Leaderboard from './components/Leaderboard';

export default function App() {
  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead__inner">
          <div className="masthead__crest" aria-hidden="true">
            <svg viewBox="0 0 100 100" width="56" height="56">
              <polygon
                points="50,4 96,36 79,92 21,92 4,36"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
              />
              <text x="50" y="62" textAnchor="middle" fontSize="40" fontWeight="800" fill="currentColor" fontFamily="var(--font-display)">
                26
              </text>
            </svg>
          </div>
          <div className="masthead__text">
            <p className="masthead__eyebrow">Fantasy Draft &mdash; Matchday Tracker</p>
            <h1 className="masthead__title">World Cup 2026</h1>
          </div>
        </div>
      </header>

      <main className="content">
        <Leaderboard />
      </main>

      <footer className="footer">
        <p>Data refreshed hourly from API-Football. Scores update automatically &mdash; no action needed.</p>
      </footer>
    </div>
  );
}