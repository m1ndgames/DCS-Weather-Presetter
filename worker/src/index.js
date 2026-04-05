import JSZip from 'jszip'
import { parseTheatre, applyPreset } from '../../webapp/src/lib/mission.js'
import { fetchRealWeather, THEATRE_COORDS } from '../../webapp/src/lib/realWeather.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    if (request.method !== 'POST') {
      return jsonError('Only POST is supported', 405)
    }

    const url = new URL(request.url)
    if (url.pathname !== '/convert') {
      return jsonError('Not found — use POST /convert', 404)
    }

    let formData
    try {
      formData = await request.formData()
    } catch {
      return jsonError('Request must be multipart/form-data', 400)
    }

    const missionFile = formData.get('mission')
    const presetRaw = formData.get('preset')

    if (!missionFile || !(missionFile instanceof File)) {
      return jsonError('Missing field: mission (file)', 400)
    }
    if (!presetRaw) {
      return jsonError('Missing field: preset (JSON string)', 400)
    }

    let preset
    try {
      preset = JSON.parse(presetRaw)
    } catch {
      return jsonError('Field "preset" is not valid JSON', 400)
    }

    try {
      const buf = await missionFile.arrayBuffer()
      const zip = await JSZip.loadAsync(buf)
      const luaText = await zip.file('mission').async('string')

      if (preset.real_weather) {
        const theatre = parseTheatre(luaText)
        const coords = THEATRE_COORDS[theatre]
        if (!coords) {
          return jsonError(`Unknown theatre "${theatre}"`, 400)
        }
        const realPreset = await fetchRealWeather(coords.lat, coords.lon)
        preset = { ...preset, ...realPreset }
      }

      const modified = applyPreset(luaText, preset)

      const newZip = new JSZip()
      zip.forEach((path, file) => {
        if (path === 'mission') {
          newZip.file(path, modified)
        } else {
          newZip.file(path, file.async('arraybuffer'), { binary: true })
        }
      })

      const outBuf = await newZip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })

      const stem = missionFile.name.replace(/\.miz$/i, '')
      const suffix = (preset.suffix || preset.weather?.name || 'converted')
        .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      const outName = `${stem}_${suffix}.miz`

      return new Response(outBuf, {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${outName}"`,
        },
      })
    } catch (err) {
      return jsonError(err.message, 500)
    }
  },
}
