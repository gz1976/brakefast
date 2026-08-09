import { useState, useEffect } from 'react';
import { useNewspaper } from './hooks/useNewspaper';
import { BrakeFastApp } from './components/BrakeFastApp';
import { OttoMonitor } from './components/OttoMonitor';
import './styles/newspaper.css';
import './styles/editorial-firstscreen.css';
import './styles/editorial-categories.css';

type AppView = 'brakefast' | 'monitor';
type AppTheme = 'dark' | 'editorial';

interface AppShellProps {
  children: React.ReactNode;
  theme: AppTheme;
  showSkipLink?: boolean;
}

function AppShell({ children, theme, showSkipLink = false }: AppShellProps) {
  return (
    <div className={`otto-app-shell otto-app-shell--${theme}`}>
      {showSkipLink && (
        <a href="#main-content" className="skip-to-content">
          Zum Inhalt springen
        </a>
      )}
      <nav className="otto-home-bar" aria-label="Übergeordnete Navigation">
        <a
          className="otto-home-link"
          data-otto-home=""
          href="https://ottobot.net/"
          aria-label="Zur OTTO-Übersicht"
        >
          ← OTTO
        </a>
      </nav>
      {children}
    </div>
  );
}

function App() {
  // URL-Hash basiertes Routing: #monitor oder default
  const [view, setView] = useState<AppView>(() => {
    return window.location.hash === '#monitor' ? 'monitor' : 'brakefast';
  });

  useEffect(() => {
    const handleHash = () => {
      setView(window.location.hash === '#monitor' ? 'monitor' : 'brakefast');
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const switchView = (v: AppView) => {
    window.location.hash = v === 'monitor' ? '#monitor' : '';
    setView(v);
  };

  // View-Switcher (unten rechts als Floating-Button)
  const viewSwitcher = (
    <button
      className="view-switcher-fab"
      onClick={() => switchView(view === 'brakefast' ? 'monitor' : 'brakefast')}
      title={view === 'brakefast' ? 'Otto Monitor öffnen' : 'BrakeFast öffnen'}
      aria-label={view === 'brakefast' ? 'Otto Monitor öffnen' : 'BrakeFast öffnen'}
    >
      {view === 'brakefast' ? '📊' : '📰'}
    </button>
  );

  if (view === 'monitor') {
    return (
      <AppShell theme="dark">
        <OttoMonitor />
        {viewSwitcher}
      </AppShell>
    );
  }

  return <BrakeFastView viewSwitcher={viewSwitcher} />;
}

// BrakeFast-Ansicht als eigene Komponente, damit useNewspaper nur geladen wird wenn noetig
function BrakeFastView({ viewSwitcher }: { viewSwitcher: React.ReactNode }) {
  const {
    data,
    loading,
    error,
    archiveEditions,
    selectedEdition,
    goToLatest,
    goToEdition,
  } = useNewspaper();

  if (loading) {
    return (
      <AppShell theme="dark">
        <div className="loading-screen">
          <h1>Brake<span>Fast</span></h1>
          <p>Lade heutige Ausgabe&hellip;</p>
        </div>
        {viewSwitcher}
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell theme="dark">
        <div className="error-screen">
          <h2>Datenformat ungueltig</h2>
          <p>{error || 'Die Ausgabe konnte nicht verarbeitet werden. Bitte spaeter erneut laden.'}</p>
        </div>
        {viewSwitcher}
      </AppShell>
    );
  }

  return (
    <AppShell theme="editorial" showSkipLink>
      <BrakeFastApp
        data={data}
        archiveEditions={archiveEditions}
        selectedEdition={selectedEdition}
        onGoToLatest={goToLatest}
        onGoToEdition={goToEdition}
      />
      {viewSwitcher}
    </AppShell>
  );
}

export default App;
