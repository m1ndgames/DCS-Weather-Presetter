<script>
  import JSZip from 'jszip'
  import { parseMission, parseTheatre, applyPreset } from './lib/mission.js'
  import { CLOUD_PRESETS } from './lib/cloudPresets.js'
  import { fetchRealWeather, THEATRE_COORDS } from './lib/realWeather.js'

  let fileName = ''
  let originalZip = null
  let preset = null
  let theatre = null
  let error = ''
  let loadingWeather = false

  async function onFileChange(e) {
    error = ''
    const file = e.target.files[0]
    if (!file) return
    fileName = file.name
    try {
      const buf = await file.arrayBuffer()
      originalZip = await JSZip.loadAsync(buf)
      const luaText = await originalZip.file('mission').async('string')
      preset = parseMission(luaText)
      theatre = parseTheatre(luaText)
    } catch (err) {
      error = 'Could not read mission file: ' + err.message
      preset = null
      theatre = null
    }
  }

  async function applyRealWeather() {
    const coords = THEATRE_COORDS[theatre]
    if (!coords) {
      error = `No coordinates found for theatre "${theatre}".`
      return
    }
    loadingWeather = true
    error = ''
    try {
      const realPreset = await fetchRealWeather(coords.lat, coords.lon)
      preset = realPreset
    } catch (err) {
      error = 'Failed to fetch weather: ' + err.message
    } finally {
      loadingWeather = false
    }
  }

  async function download() {
    if (!originalZip || !preset) return
    try {
      const luaText = await originalZip.file('mission').async('string')
      const modified = applyPreset(luaText, preset)
      const newZip = new JSZip()
      originalZip.forEach((path, file) => {
        if (path === 'mission') {
          newZip.file(path, modified)
        } else {
          newZip.file(path, file.async('arraybuffer'), { binary: true })
        }
      })
      const blob = await newZip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      const stem = fileName.replace(/\.miz$/i, '')
      const suffix = preset.weather.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      const outName = `${stem}_${suffix}.miz`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = outName
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      error = 'Failed to generate file: ' + err.message
    }
  }

  const PRECIP_OPTIONS = [
    { value: 0, label: 'None' },
    { value: 1, label: 'Rain' },
    { value: 2, label: 'Thunderstorm' },
  ]
</script>

<main>
  <header>
    <h1>DCS Weather Presetter</h1>
    <p>Upload a mission, tweak the weather, download the result.</p>
  </header>

  <section class="upload-zone">
    <label class="upload-btn">
      {#if fileName}
        <span class="icon">✓</span> {fileName}
      {:else}
        <span class="icon">↑</span> Choose .miz file
      {/if}
      <input type="file" accept=".miz" on:change={onFileChange} />
    </label>

    {#if theatre}
      <button
        type="button"
        class="btn-realweather"
        on:click={applyRealWeather}
        disabled={loadingWeather}
      >
        {#if loadingWeather}
          Fetching…
        {:else}
          ⛅ Use current weather
          {#if THEATRE_COORDS[theatre]}
            <span class="theatre-hint">({THEATRE_COORDS[theatre].name})</span>
          {/if}
        {/if}
      </button>
    {/if}
  </section>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if preset}
    <form on:submit|preventDefault={download}>

      <!-- DATE & TIME -->
      <section class="card">
        <h2>Date &amp; Time</h2>
        <div class="grid-3">
          <label>Year<input type="number" bind:value={preset.date.year} min="1900" max="2100" /></label>
          <label>Month<input type="number" bind:value={preset.date.month} min="1" max="12" /></label>
          <label>Day<input type="number" bind:value={preset.date.day} min="1" max="31" /></label>
        </div>
        <div class="grid-3">
          <label>Hour (0–23)<input type="number" bind:value={preset.time.hour} min="0" max="23" /></label>
          <label>Minute<input type="number" bind:value={preset.time.minute} min="0" max="59" /></label>
          <label>Second<input type="number" bind:value={preset.time.second} min="0" max="59" /></label>
        </div>
      </section>

      <!-- CLOUDS -->
      <section class="card">
        <h2>Clouds</h2>
        <div class="grid-2">
          <label>Preset
            <select bind:value={preset.weather.clouds.preset}>
              {#each CLOUD_PRESETS as p}
                <option value={p.value}>{p.label} ({p.value})</option>
              {/each}
            </select>
          </label>
          <label>Precipitation
            <select bind:value={preset.weather.clouds.iprecptns}>
              {#each PRECIP_OPTIONS as o}
                <option value={o.value}>{o.label}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="grid-3">
          <label>Base (m)<input type="number" bind:value={preset.weather.clouds.base} min="0" /></label>
          <label>Density (0–10)<input type="number" bind:value={preset.weather.clouds.density} min="0" max="10" /></label>
          <label>Thickness (m)<input type="number" bind:value={preset.weather.clouds.thickness} min="0" /></label>
        </div>
      </section>

      <!-- WIND -->
      <section class="card">
        <h2>Wind</h2>
        <div class="wind-grid">
          <span class="wind-header"></span>
          <span class="wind-header">Speed (m/s)</span>
          <span class="wind-header">Direction (°)</span>

          <span class="wind-label">Ground</span>
          <input type="number" bind:value={preset.weather.wind.atGround.speed} min="0" />
          <input type="number" bind:value={preset.weather.wind.atGround.dir} min="0" max="359" />

          <span class="wind-label">2 000 m</span>
          <input type="number" bind:value={preset.weather.wind.at2000.speed} min="0" />
          <input type="number" bind:value={preset.weather.wind.at2000.dir} min="0" max="359" />

          <span class="wind-label">8 000 m</span>
          <input type="number" bind:value={preset.weather.wind.at8000.speed} min="0" />
          <input type="number" bind:value={preset.weather.wind.at8000.dir} min="0" max="359" />
        </div>
      </section>

      <!-- ATMOSPHERE -->
      <section class="card">
        <h2>Atmosphere</h2>
        <div class="grid-3">
          <label>Temperature (°C)<input type="number" bind:value={preset.weather.season.temperature} /></label>
          <label>QNH (mmHg)<input type="number" bind:value={preset.weather.qnh} min="0" /></label>
          <label>Turbulence (m/s)<input type="number" bind:value={preset.weather.groundTurbulence} min="0" /></label>
        </div>
        <div class="grid-3">
          <label>Visibility (m)<input type="number" bind:value={preset.weather.visibility.distance} min="0" /></label>
          <label class="toggle">
            <input type="checkbox" bind:checked={preset.weather.enable_fog} />
            Fog
          </label>
          {#if preset.weather.enable_fog}
            <label>Fog visibility (m)<input type="number" bind:value={preset.weather.fog.visibility} min="0" /></label>
            <label>Fog thickness (m)<input type="number" bind:value={preset.weather.fog.thickness} min="0" /></label>
          {/if}
          <label class="toggle">
            <input type="checkbox" bind:checked={preset.weather.enable_dust} />
            Dust / sandstorm
          </label>
          {#if preset.weather.enable_dust}
            <label>Dust density<input type="number" bind:value={preset.weather.dust_density} min="0" /></label>
          {/if}
        </div>
      </section>

      <div class="actions">
        <button type="submit" class="btn-primary">Download modified mission</button>
      </div>

    </form>
  {/if}
</main>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) {
    font-family: system-ui, sans-serif;
    background: #0d1117;
    color: #e6edf3;
    min-height: 100vh;
  }

  main {
    max-width: 760px;
    margin: 0 auto;
    padding: 2rem 1rem 4rem;
  }

  header { margin-bottom: 2rem; }
  h1 { font-size: 1.6rem; font-weight: 700; color: #58a6ff; }
  header p { color: #8b949e; margin-top: .3rem; }

  /* Upload */
  .upload-zone {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: .75rem;
    margin-bottom: 1.5rem;
  }
  .upload-btn {
    display: inline-flex;
    align-items: center;
    gap: .5rem;
    padding: .65rem 1.2rem;
    border: 1.5px dashed #30363d;
    border-radius: 8px;
    cursor: pointer;
    font-size: .95rem;
    color: #8b949e;
    transition: border-color .15s, color .15s;
  }
  .upload-btn:hover { border-color: #58a6ff; color: #58a6ff; }
  .upload-btn input { display: none; }
  .icon { font-size: 1.1rem; }

  .btn-realweather {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
    padding: .6rem 1.1rem;
    background: #1c2d3a;
    border: 1px solid #2d6a8f;
    border-radius: 8px;
    color: #79c0ff;
    font-size: .9rem;
    font-weight: 500;
    cursor: pointer;
    transition: background .15s, border-color .15s;
  }
  .btn-realweather:hover:not(:disabled) { background: #1f3a4f; border-color: #58a6ff; }
  .btn-realweather:disabled { opacity: .6; cursor: not-allowed; }
  .theatre-hint { color: #8b949e; font-size: .8rem; font-weight: 400; }

  .error { color: #f85149; margin-bottom: 1rem; font-size: .9rem; }

  /* Cards */
  .card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 10px;
    padding: 1.25rem 1.5rem;
    margin-bottom: 1rem;
  }
  h2 { font-size: 1rem; font-weight: 600; color: #58a6ff; margin-bottom: 1rem; }

  /* Grids */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin-bottom: .75rem; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; margin-bottom: .75rem; }
  .grid-2:last-child, .grid-3:last-child { margin-bottom: 0; }

  label {
    display: flex;
    flex-direction: column;
    gap: .3rem;
    font-size: .8rem;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  label.toggle {
    flex-direction: row;
    align-items: center;
    gap: .5rem;
    text-transform: none;
    font-size: .9rem;
    color: #e6edf3;
    cursor: pointer;
  }

  input[type="number"],
  select {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #e6edf3;
    padding: .4rem .6rem;
    font-size: .9rem;
    width: 100%;
    transition: border-color .15s;
  }
  input:focus, select:focus { outline: none; border-color: #58a6ff; }
  input[type="checkbox"] { width: 1rem; height: 1rem; accent-color: #58a6ff; cursor: pointer; }

  /* Wind table */
  .wind-grid {
    display: grid;
    grid-template-columns: 6rem 1fr 1fr;
    gap: .5rem .75rem;
    align-items: center;
  }
  .wind-header {
    font-size: .75rem;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .wind-label { font-size: .9rem; color: #e6edf3; }

  /* Actions */
  .actions { margin-top: 1.5rem; display: flex; justify-content: flex-end; }
  .btn-primary {
    background: #238636;
    border: 1px solid #2ea043;
    color: #fff;
    padding: .6rem 1.4rem;
    border-radius: 7px;
    font-size: .95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s;
  }
  .btn-primary:hover { background: #2ea043; }

  @media (max-width: 520px) {
    .grid-2, .grid-3 { grid-template-columns: 1fr 1fr; }
    .grid-3 > :last-child:nth-child(odd) { grid-column: span 2; }
  }
</style>
