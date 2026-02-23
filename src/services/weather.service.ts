/**
 * WeatherService — Fake weather data provider.
 *
 * Returns deterministic results per city (seeded from city name hash)
 * so tests are predictable. Replace with OpenWeatherMap API for production.
 */
export class WeatherService {
  private static CONDITIONS = [
    'Sunny',
    'Partly Cloudy',
    'Cloudy',
    'Light Rain',
    'Heavy Rain',
    'Thunderstorm',
    'Foggy',
    'Clear',
  ];

  /**
   * Simple hash of a string to produce a deterministic seed.
   */
  private hash(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  /**
   * Get weather data for a city.
   * Results are deterministic per city name (case-insensitive).
   */
  async getWeather(
    city: string,
  ): Promise<{
    city: string;
    temp: number;
    humidity: number;
    condition: string;
  }> {
    const seed = this.hash(city.toLowerCase());
    return {
      city,
      temp: 20 + (seed % 20), // 20–39 °C
      humidity: 40 + (seed % 40), // 40–79 %
      condition:
        WeatherService.CONDITIONS[seed % WeatherService.CONDITIONS.length],
    };
  }
}
