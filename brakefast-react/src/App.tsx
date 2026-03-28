import { useState, useEffect } from 'react';
import { useNewspaper } from './hooks/useNewspaper';
import { BrakeFastApp } from './components/BrakeFastApp';
import { OttoMonitor } from './components/OttoMonitor';
import './styles/newspaper.css';

type AppView = 'brakefast' | 'monitor';

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
      title={view === 'brakefast' ? 'Otto Monitor oeffnen' : 'BrakeFast oeffnen'}
    >
      {view === 'brakefast' ? '📊' : '📰'}
    </button>
  );

  if (view === 'monitor') {
    return (
      <>
        <OttoMonitor />
        {viewSwitcher}
      </>
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
      <>
        <div className="loading-screen">
          <h1>Brake<span>Fast</span></h1>
          <p>Lade heutige Ausgabe&hellip;</p>
        </div>
        {viewSwitcher}
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <div className="loading-screen">
          <h1>Brake<span>Fast</span></h1>
          <p>Fehler beim Laden: {error || 'Keine Daten'}</p>
        </div>
        {viewSwitcher}
      </>
    );
  }

  return (
    <>
      <a href="#main-content" className="skip-to-content">
        Zum Inhalt springen
      </a>
      <BrakeFastApp
        data={data}
        archiveEditions={archiveEditions}
        selectedEdition={selectedEdition}
        onGoToLatest={goToLatest}
        onGoToEdition={goToEdition}
      />
      {viewSwitcher}
    </>
  );
}

export default App;
