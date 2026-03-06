import { useNewspaper } from './hooks/useNewspaper';
import { BrakeFastApp } from './components/BrakeFastApp';
import './styles/newspaper.css';

function App() {
  const { data, loading, error } = useNewspaper();

  if (loading) {
    return (
      <div className="loading-screen">
        <h1>Brake<span>Fast</span></h1>
        <p>Lade heutige Ausgabe&hellip;</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="loading-screen">
        <h1>Brake<span>Fast</span></h1>
        <p>Fehler beim Laden: {error || 'Keine Daten'}</p>
      </div>
    );
  }

  return <BrakeFastApp data={data} />;
}

export default App;
