import type { WeatherData } from '../../types';

interface Props {
  weather: WeatherData;
}

export function WeatherWidget({ weather }: Props) {
  const icon = weather.icon || (weather.temp > 20 ? '☀️' : weather.temp > 5 ? '⛅' : '🌤');

  return (
    <div className="dash-widget">
      <div className="dash-label"><span className="icon">🌤</span> Wetter {weather.location || 'Voitsberg'}</div>
      <div className="weather-main">
        <div className="weather-icon">{icon}</div>
        <div>
          <div className="weather-temp">{weather.temp > 0 ? '+' : ''}{weather.temp}°</div>
          <div className="weather-detail">{weather.description}</div>
          <div className="weather-loc">
            Gefühlt {weather.feelsLike > 0 ? '+' : ''}{weather.feelsLike}° · ↑{weather.max}° ↓{weather.min}°
          </div>
        </div>
      </div>
    </div>
  );
}
