/**
 * Reads a scalar Lua value like ["key"] = 123 or ["key"] = "foo" or ["key"] = true
 */
function readScalar(content, key) {
  const re = new RegExp(`\\["${key}"\\]\\s*=\\s*([^,\\n]+),`)
  const m = content.match(re)
  if (!m) return null
  const raw = m[1].trim()
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw.startsWith('"')) return raw.slice(1, -1)
  return Number(raw)
}

/**
 * Extracts a named block delimited by -- end of ["key"]
 */
function extractBlock(content, key) {
  const start = content.indexOf(`["${key}"]`)
  if (start === -1) return null
  const endMarker = `-- end of ["${key}"]`
  const end = content.indexOf(endMarker, start)
  if (end === -1) return null
  return content.slice(start, end + endMarker.length)
}

export function parseMission(luaText) {
  const dateBlock = extractBlock(luaText, 'date')
  const weatherBlock = extractBlock(luaText, 'weather')
  const windBlock = extractBlock(weatherBlock, 'wind')
  const cloudsBlock = extractBlock(weatherBlock, 'clouds')
  const fogBlock = extractBlock(weatherBlock, 'fog')
  const visBlock = extractBlock(weatherBlock, 'visibility')
  const seasonBlock = extractBlock(weatherBlock, 'season')
  const haloBlock = extractBlock(weatherBlock, 'halo')
  const at8000Block = extractBlock(windBlock, 'at8000')
  const atGroundBlock = extractBlock(windBlock, 'atGround')
  const at2000Block = extractBlock(windBlock, 'at2000')

  // top-level start_time has exactly one leading tab
  const startTimeMatch = luaText.match(/^\t\["start_time"\]\s*=\s*(\d+),/m)
  const startTimeSecs = startTimeMatch ? Number(startTimeMatch[1]) : 0

  return {
    date: {
      year: readScalar(dateBlock, 'Year'),
      month: readScalar(dateBlock, 'Month'),
      day: readScalar(dateBlock, 'Day'),
    },
    time: {
      hour: Math.floor(startTimeSecs / 3600),
      minute: Math.floor((startTimeSecs % 3600) / 60),
      second: startTimeSecs % 60,
    },
    weather: {
      name: readScalar(weatherBlock, 'name'),
      atmosphere_type: readScalar(weatherBlock, 'atmosphere_type'),
      groundTurbulence: readScalar(weatherBlock, 'groundTurbulence'),
      modifiedTime: readScalar(weatherBlock, 'modifiedTime'),
      type_weather: readScalar(weatherBlock, 'type_weather'),
      qnh: readScalar(weatherBlock, 'qnh'),
      enable_fog: readScalar(weatherBlock, 'enable_fog'),
      enable_dust: readScalar(weatherBlock, 'enable_dust'),
      dust_density: readScalar(weatherBlock, 'dust_density'),
      season: { temperature: readScalar(seasonBlock, 'temperature') },
      fog: {
        visibility: readScalar(fogBlock, 'visibility'),
        thickness: readScalar(fogBlock, 'thickness'),
      },
      visibility: { distance: readScalar(visBlock, 'distance') },
      wind: {
        at8000: { speed: readScalar(at8000Block, 'speed'), dir: readScalar(at8000Block, 'dir') },
        atGround: { speed: readScalar(atGroundBlock, 'speed'), dir: readScalar(atGroundBlock, 'dir') },
        at2000: { speed: readScalar(at2000Block, 'speed'), dir: readScalar(at2000Block, 'dir') },
      },
      clouds: {
        preset: readScalar(cloudsBlock, 'preset'),
        base: readScalar(cloudsBlock, 'base'),
        density: readScalar(cloudsBlock, 'density'),
        thickness: readScalar(cloudsBlock, 'thickness'),
        iprecptns: readScalar(cloudsBlock, 'iprecptns'),
      },
      halo: { preset: readScalar(haloBlock, 'preset') },
    },
  }
}

function luaBool(v) { return v ? 'true' : 'false' }

function buildDateBlock(date) {
  return `["date"] = \n\t{\n\t\t["Year"] = ${date.year},\n\t\t["Day"] = ${date.day},\n\t\t["Month"] = ${date.month},\n\t}, -- end of ["date"]`
}

function buildWeatherBlock(w) {
  const wind = w.wind, clouds = w.clouds, fog = w.fog, vis = w.visibility
  const lines = [
    '["weather"] = ', '\t{',
    '\t\t["wind"] = ', '\t\t{',
  ]
  for (const level of ['at8000', 'atGround', 'at2000']) {
    lines.push(
      `\t\t\t["${level}"] = `, '\t\t\t{',
      `\t\t\t\t["speed"] = ${wind[level].speed},`,
      `\t\t\t\t["dir"] = ${wind[level].dir},`,
      `\t\t\t}, -- end of ["${level}"]`,
    )
  }
  lines.push(
    '\t\t}, -- end of ["wind"]',
    `\t\t["enable_fog"] = ${luaBool(w.enable_fog)},`,
    '\t\t["season"] = ', '\t\t{',
    `\t\t\t["temperature"] = ${w.season.temperature},`,
    '\t\t}, -- end of ["season"]',
    `\t\t["qnh"] = ${w.qnh},`,
    '\t\t["cyclones"] = {},',
    `\t\t["dust_density"] = ${w.dust_density},`,
    `\t\t["enable_dust"] = ${luaBool(w.enable_dust)},`,
    '\t\t["clouds"] = ', '\t\t{',
    `\t\t\t["thickness"] = ${clouds.thickness},`,
    `\t\t\t["density"] = ${clouds.density},`,
    `\t\t\t["preset"] = "${clouds.preset}",`,
    `\t\t\t["base"] = ${clouds.base},`,
    `\t\t\t["iprecptns"] = ${clouds.iprecptns},`,
    '\t\t}, -- end of ["clouds"]',
    `\t\t["atmosphere_type"] = ${w.atmosphere_type},`,
    `\t\t["groundTurbulence"] = ${w.groundTurbulence},`,
    '\t\t["halo"] = ', '\t\t{',
    `\t\t\t["preset"] = "${w.halo.preset}",`,
    '\t\t}, -- end of ["halo"]',
    `\t\t["type_weather"] = ${w.type_weather},`,
    `\t\t["modifiedTime"] = ${luaBool(w.modifiedTime)},`,
    `\t\t["name"] = "${w.name}",`,
    '\t\t["fog"] = ', '\t\t{',
    `\t\t\t["visibility"] = ${fog.visibility},`,
    `\t\t\t["thickness"] = ${fog.thickness},`,
    '\t\t}, -- end of ["fog"]',
    '\t\t["visibility"] = ', '\t\t{',
    `\t\t\t["distance"] = ${vis.distance},`,
    '\t\t}, -- end of ["visibility"]',
    '\t}, -- end of ["weather"]',
  )
  return lines.join('\n')
}

export function applyPreset(luaText, preset) {
  let out = luaText

  out = out.replace(
    /\["date"\] = \n[\s\S]*?-- end of \["date"\]/,
    buildDateBlock(preset.date),
  )
  out = out.replace(
    /\["weather"\] = \n[\s\S]*?-- end of \["weather"\]/,
    buildWeatherBlock(preset.weather),
  )

  const secs = preset.time.hour * 3600 + (preset.time.minute ?? 0) * 60 + (preset.time.second ?? 0)
  out = out.replace(/^\t\["start_time"\] = \d+,/m, `\t["start_time"] = ${secs},`)

  return out
}
