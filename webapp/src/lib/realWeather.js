// Centre coordinates for each DCS theatre
export const THEATRE_COORDS = {
  GermanyCW:      { lat: 51.0,  lon:   8.0, name: 'Germany (Central/West)' },
  Caucasus:       { lat: 41.7,  lon:  44.8, name: 'Caucasus' },
  PersianGulf:    { lat: 25.0,  lon:  56.0, name: 'Persian Gulf' },
  Nevada:         { lat: 36.6,  lon: -115.0, name: 'Nevada (NTTR)' },
  Normandy:       { lat: 49.2,  lon:  -0.5, name: 'Normandy' },
  TheChannel:     { lat: 51.0,  lon:   2.0, name: 'The Channel' },
  Syria:          { lat: 33.5,  lon:  36.3, name: 'Syria' },
  MarianaIslands: { lat: 13.5,  lon: 144.8, name: 'Mariana Islands' },
  SouthAtlantic:  { lat: -51.7, lon: -59.0, name: 'South Atlantic' },
  Sinai:          { lat: 29.0,  lon:  34.0, name: 'Sinai' },
  Afghanistan:    { lat: 34.5,  lon:  69.2, name: 'Afghanistan' },
  Iraq:           { lat: 33.3,  lon:  44.4, name: 'Iraq' },
  Kola:           { lat: 69.0,  lon:  33.0, name: 'Kola Peninsula' },
}

function cloudPresetFromConditions(cloudCover, weatherCode) {
  const isThunderstorm = weatherCode >= 95
  const isPrecip = (weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)

  if (isThunderstorm) return { preset: 'RainyPreset1', iprecptns: 2 }
  if (isPrecip) {
    if (cloudCover > 80) return { preset: 'RainyPreset2', iprecptns: 1 }
    return { preset: 'RainyPreset4', iprecptns: 1 }
  }
  if (cloudCover <  6) return { preset: 'Preset1',  iprecptns: 0 }
  if (cloudCover < 12) return { preset: 'Preset2',  iprecptns: 0 }
  if (cloudCover < 25) return { preset: 'Preset5',  iprecptns: 0 }
  if (cloudCover < 37) return { preset: 'Preset7',  iprecptns: 0 }
  if (cloudCover < 50) return { preset: 'Preset9',  iprecptns: 0 }
  if (cloudCover < 62) return { preset: 'Preset13', iprecptns: 0 }
  if (cloudCover < 75) return { preset: 'Preset16', iprecptns: 0 }
  if (cloudCover < 87) return { preset: 'Preset19', iprecptns: 0 }
  return { preset: 'Preset21', iprecptns: 0 }
}

function cloudBaseFromCover(cloudCover) {
  if (cloudCover < 25) return 3000
  if (cloudCover < 50) return 2000
  if (cloudCover < 75) return 1500
  if (cloudCover < 90) return 900
  return 500
}

function cloudDensityFromCover(cloudCover) {
  if (cloudCover < 25) return 0
  if (cloudCover < 50) return 3
  if (cloudCover < 75) return 5
  if (cloudCover < 87) return 7
  return 9
}

function cloudThicknessFromCover(cloudCover) {
  if (cloudCover < 25) return 200
  if (cloudCover < 50) return 400
  if (cloudCover < 75) return 600
  if (cloudCover < 87) return 800
  return 1000
}

function weatherNameFromCode(weatherCode, cloudCover) {
  if (weatherCode >= 95) return 'Thunderstorm'
  if (weatherCode >= 80) return 'Rain showers'
  if (weatherCode >= 61) return 'Rain'
  if (weatherCode >= 51) return 'Drizzle'
  if (weatherCode === 45 || weatherCode === 48) return 'Fog'
  if (cloudCover <  6) return 'Clear sky'
  if (cloudCover < 25) return 'Few clouds'
  if (cloudCover < 50) return 'Scattered clouds'
  if (cloudCover < 87) return 'Broken clouds'
  return 'Overcast'
}

/**
 * Fetches current real-world weather for the given coordinates from Open-Meteo
 * and maps it to a DCS preset object.
 */
export async function fetchRealWeather(lat, lon) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', lat)
  url.searchParams.set('longitude', lon)
  url.searchParams.set('current', 'temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation,surface_pressure,visibility,weather_code')
  url.searchParams.set('hourly', 'wind_speed_850hPa,wind_direction_850hPa,wind_speed_300hPa,wind_direction_300hPa')
  url.searchParams.set('forecast_days', '1')
  url.searchParams.set('wind_speed_unit', 'ms')
  url.searchParams.set('timezone', 'UTC')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`)
  const data = await res.json()

  const cur = data.current
  const currentHourPrefix = cur.time.substring(0, 13) // e.g. "2026-04-05T10"
  const hi = data.hourly.time.findIndex(t => t.startsWith(currentHourPrefix))
  const hourIdx = hi === -1 ? 0 : hi

  const cloudCover = cur.cloud_cover
  const weatherCode = cur.weather_code
  const isFog = weatherCode === 45 || weatherCode === 48
  const { preset, iprecptns } = cloudPresetFromConditions(cloudCover, weatherCode)

  // hPa → mmHg
  const qnh = Math.round(cur.surface_pressure * 0.750064)

  const now = new Date()
  const utcH = now.getUTCHours()
  const utcM = now.getUTCMinutes()
  const utcS = now.getUTCSeconds()

  return {
    date: {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
    },
    time: { hour: utcH, minute: utcM, second: utcS },
    weather: {
      name: weatherNameFromCode(weatherCode, cloudCover),
      atmosphere_type: 0,
      groundTurbulence: 0,
      modifiedTime: false,
      type_weather: weatherCode >= 95 ? 1 : 0,
      qnh,
      enable_fog: isFog || cur.visibility < 1000,
      enable_dust: false,
      dust_density: 0,
      season: { temperature: Math.round(cur.temperature_2m) },
      fog: {
        visibility: isFog ? Math.round(cur.visibility) : 0,
        thickness: isFog ? 200 : 0,
      },
      visibility: { distance: Math.min(Math.round(cur.visibility), 80000) },
      wind: {
        atGround: {
          speed: Math.round(cur.wind_speed_10m),
          dir: cur.wind_direction_10m,
        },
        at2000: {
          speed: Math.round(data.hourly.wind_speed_850hPa[hourIdx]),
          dir: data.hourly.wind_direction_850hPa[hourIdx],
        },
        at8000: {
          speed: Math.round(data.hourly.wind_speed_300hPa[hourIdx]),
          dir: data.hourly.wind_direction_300hPa[hourIdx],
        },
      },
      clouds: {
        preset,
        base: cloudBaseFromCover(cloudCover),
        density: cloudDensityFromCover(cloudCover),
        thickness: cloudThicknessFromCover(cloudCover),
        iprecptns,
      },
      halo: { preset: 'auto' },
    },
  }
}
