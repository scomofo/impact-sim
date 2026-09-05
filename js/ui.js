// ui.js — control panel, presets, and physics readouts. No framework.
import { COMPOSITIONS, TARGETS, MAX_DISTANCE, observerReport } from './physics.js';
import { MODEL_VERSION, SOURCES, modelNotes, diameterSensitivity, createAssessmentReport } from './assessment.js';
import { CATALOG, CITIES, ERA_LABELS, ERA_ORDER, eventById } from './catalog.js';

const $ = (id) => document.getElementById(id);

// Diameter slider is logarithmic: 10 m .. 7420 km (Theia).
const DIA_LOG_MIN = 1;       // log10(10 m)
const DIA_LOG_MAX = Math.log10(7420000);  // log10(7420 km)
const diaFromSlider = (t) => Math.min(7420000, Math.max(10, 10 ** (DIA_LOG_MIN + (t / 1000) * (DIA_LOG_MAX - DIA_LOG_MIN))));
const sliderFromDia = (d) => Math.round(((Math.log10(d) - DIA_LOG_MIN) / (DIA_LOG_MAX - DIA_LOG_MIN)) * 1000);

// --- formatting -------------------------------------------------------------
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function sci(n, digits = 1) {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(n)));
  const m = n / 10 ** e;
  const sup = String(e).split('').map((c) => SUP[c]).join('');
  return `${m.toFixed(digits)}×10${sup}`;
}
function num(n, digits = 0) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e6) return sci(n);
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}
function fmtLen(m) {
  if (m < 1000) return `${num(m, m < 20 ? 1 : 0)} m`;
  const km = m / 1000;
  if (km < 100) return `${km.toFixed(1)} km`;
  if (km < 1e6) return `${num(km)} km`;
  return `${sci(km)} km`;
}
function fmtTime(s) {
  if (!Number.isFinite(s)) return '—';
  if (s < 90) return `${s.toFixed(0)} s`;
  if (s < 5400) return `${(s / 60).toFixed(0)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}
function fmtYears(y) {
  if (y == null || y > 4.5e9) return 'outside the useful range of this fit';
  if (y < 1) return 'several times a year';
  if (y < 1e3) return `every ~${num(y)} years`;
  if (y < 1e6) return `every ~${num(y / 1e3, 1)} thousand years`;
  if (y < 1e9) return `every ~${num(y / 1e6, 1)} million years`;
  if (y < 1e12) return `every ~${num(y / 1e9, 1)} billion years`;
  return 'effectively never';
}
function fmtEnergy(res) {
  return `${sci(res.energy)} J · ${sci(res.energyMt)} Mt TNT`;
}
function compareLine(mt) {
  if (mt < 1) return `≈ ${num(mt / 0.015, 1)} × Hiroshima`;
  if (mt < 1e6) return `≈ ${num(mt / 50, 1)} × Tsar Bomba`;
  return `≈ ${num(mt / 1e8, mt / 1e8 < 10 ? 2 : 0)} × Chicxulub`;
}

// --- readout rendering ------------------------------------------------------
function row(label, value, cls = '') {
  return `<div class="row ${cls}"><span class="lbl">${label}</span><span class="val">${value}</span></div>`;
}
function badge(text, level) {
  return `<div class="badge sev-${level}">${text}</div>`;
}

export function renderReadout(res) {
  const rows = [];
  rows.push(row('Mass', `${sci(res.mass)} kg`));
  rows.push(row('Incoming energy', fmtEnergy(res)));
  rows.push(row('', compareLine(res.energyMt), 'sub'));

  if (res.regime === 'airburst') {
    rows.unshift(badge('AIRBURST — breaks up in atmosphere', 0));
    rows.push(row('Breaks up at', fmtLen(res.breakupAlt ?? 0) + ' altitude'));
    rows.push(row('Airburst altitude', fmtLen(res.burstAlt ?? 0) + ' altitude'));
    rows.push(row('Deposited by burst altitude', `${sci(res.depositedEnergy)} J`));
    rows.push(row('Residual swarm energy', `${sci(res.residualEnergy)} J`));
    rows.push(row('Blast yield assumption', 'all incoming kinetic energy'));
    rows.push(row('Crater', 'fragment impacts not resolved'));
    rows.push(row('Global recurrence estimate', fmtYears(res.recurrence)));
    return rows.join('');
  }

  if (res.regime === 'crater') {
    rows.unshift(badge(res.severity.label, res.severity.level));
    const c = res.crater;
    rows.push(row('Surface energy', `${sci(res.energySurf)} J`));
    if (res.vSurface < res.velocity * 0.97) {
      rows.push(row('Slowed by atmosphere', `hits at ${(res.vSurface / 1000).toFixed(1)} km/s`));
    }
    if (res.waterCrater) {
      rows.push(row('Water cavity', `${fmtLen(res.waterCrater)} across, blasted in the ocean`));
      rows.push(row('Seafloor speed', `${(res.vSeafloor / 1000).toPrecision(2)} km/s`));
      rows.push(row('Seafloor energy', `${sci(res.energySeafloor)} J`));
    }
    if (!c) {
      rows.push(row('Ground effects', 'not resolved at this low speed'));
    } else {
      rows.push(row(res.basin ? 'Impact basin' : res.waterCrater ? 'Seafloor crater' : 'Final crater',
        `${fmtLen(c.Dfr)} across · ${fmtLen(c.depth)} deep`));
      rows.push(row('', res.basin ? 'planet-scarring basin (scaling stretched)'
        : c.isComplex ? 'complex crater (central peak, terraces)' : 'simple bowl crater', 'sub'));
    }
    rows.push(row('Fireball radius', res.fireball ? fmtLen(res.fireball) : 'no vapor fireball (< 15 km/s)'));
    if (res.burn) rows.push(row('3rd-degree burns within', fmtLen(res.burn)));
    if (res.seismic != null) rows.push(row('Seismic magnitude estimate', `M ${res.seismic.toFixed(1)}`));
    if (res.melt > 0) rows.push(row('Rock melted', `${sci(res.melt / 1e9)} km³`));
    rows.push(row('Global recurrence estimate', fmtYears(res.recurrence)));
    return rows.join('');
  }

  // giant
  const g = res.giant;
  rows.unshift(badge(`GIANT IMPACT — ${g.outcome.toUpperCase()}`, 5));
  rows.push(row('Mass ratio', `${(g.gamma * 100).toFixed(1)}% of Earth`));
  rows.push(row('Speed', `${g.vRatio.toFixed(2)} × mutual escape velocity (${(g.vEsc / 1000).toFixed(1)} km/s)`));
  rows.push(row('Geometry', g.grazing ? `grazing, b = ${g.b.toFixed(2)}` : `direct, b = ${g.b.toFixed(2)}`));
  rows.push(row('Disruption ratio Q/Q*', g.ratio < 0.01 ? '< 0.01' : g.ratio.toFixed(2)));
  rows.push(row('Largest remnant', `${(g.mlrFrac * 100).toFixed(0)}% of total mass`));
  if (g.merged && g.dayHours) rows.push(row('Day length after', `≈ ${g.dayHours.toFixed(1)} h · heuristic`));
  rows.push(row('Melt proxy (heuristic)', g.magmaOcean ? `global magma ocean (${(g.meltFraction * 100).toFixed(0)}%)` : `${(g.meltFraction * 100).toFixed(0)}% — partial`));
  if (g.synestia) rows.push(row('Illustrative state', 'possible synestia (heuristic)', 'highlight'));
  if (g.moonForming) {
    rows.push(row('Debris disk', `≈ ${g.diskMoons.toFixed(1)} lunar masses · moon formation possible (heuristic)`, 'highlight'));
  } else if (g.diskMoons > 0.05) {
    rows.push(row('Debris disk', `≈ ${g.diskMoons.toFixed(2)} lunar masses`));
  }
  if (g.outcome === 'hit-and-run') rows.push(row('Projectile', 'survives, escapes mangled'));
  return rows.join('');
}

// Observer panel: what happens at distance r (m) for the last-computed result.
export function renderObserver(res, r) {
  if (!res) return '';
  const o = observerReport(res, r);
  const rows = [];
  if (o.giant) {
    rows.push(badge('Local observer effects not modeled for giant impacts', 5));
    return rows.join('');
  }
  if (o.insideWaterCavity || o.unresolvedNearField) {
    rows.push(badge(o.insideWaterCavity ? 'Inside the modeled water cavity' : 'Near-field effects unresolved', 5));
    rows.push(row('', 'Distance-based observer formulas do not apply here.', 'sub'));
    return rows.join('');
  }
  if (o.insideCrater) {
    rows.push(badge('Inside the modeled crater · observer estimates unavailable', 5));
    return rows.join('');
  }
  if (o.insideFireball) rows.push(badge('Inside the modeled fireball', 5));
  if (o.thermal && !o.thermal.belowHorizon && o.thermal.exposure > 1000 && !o.insideFireball) {
    const eff = o.thermal.effects.length ? o.thermal.effects.join(', ') : 'warmth, no burns';
    rows.push(row('Thermal flash', `${(o.thermal.exposure / 1e6).toPrecision(2)} MJ/m²`));
    rows.push(row('', `${eff} · lasts ${fmtTime(o.thermal.duration)}`, 'sub'));
  } else if (o.thermal?.belowHorizon) {
    rows.push(row('Thermal flash', 'fireball hidden below horizon'));
  }
  if (o.blast) {
    const kpa = o.blast.p / 1000;
    rows.push(row('Air blast', `${kpa >= 100 ? kpa.toFixed(0) : kpa.toPrecision(2)} kPa · wind ${(o.blast.wind * 3.6).toFixed(0)} km/h`));
    rows.push(row('', `${o.blast.damage ?? 'below the listed structural-damage thresholds'}${o.blast.unreliable ? ' (rough — beyond the blast fit’s range)' : ''} · approximate arrival ${fmtTime(o.blast.arrival)}`, 'sub'));
  }
  if (o.seismic && o.seismic.Meff > 0) {
    rows.push(row('Ground shaking', `effective M ${o.seismic.Meff.toFixed(1)}`));
    rows.push(row('', `${o.seismic.mercalli} · arrives ${fmtTime(o.seismic.arrival)}`, 'sub'));
  }
  if (o.ejecta) {
    if (o.ejecta.note) {
      rows.push(row('Ejecta', o.ejecta.note));
    } else if (o.ejecta.thickness > 0.001) {
      const t = o.ejecta.thickness;
      rows.push(row('Ejecta blanket', t >= 1 ? `${num(t, 1)} m deep` : `${(t * 1000).toFixed(0)} mm`));
      rows.push(row('', `raining down ${fmtTime(o.ejecta.arrival)} after impact`, 'sub'));
    } else {
      rows.push(row('Ejecta', 'a dusting at most'));
    }
  }
  if (o.groundEffectsUnresolved) rows.push(row('Shaking / rock ejecta', 'not calculated at this ground speed'));
  if (res.regime === 'airburst') rows.push(row('Heat / fragments', 'not calculated for airbursts'));
  if (o.tsunami && o.tsunami.amplitude != null) {
    const h = o.tsunami.amplitude;
    rows.push(row('Open-water amplitude', h >= 1 ? `≈ ${num(h, 1)} m` : `≈ ${(h * 100).toFixed(1)} cm`));
    rows.push(row('', `heuristic · constant-depth arrival ≈ ${fmtTime(o.tsunami.arrival)}; coastal run-up unavailable`, 'sub'));
  }
  return rows.join('');
}

// --- init -------------------------------------------------------------------
export function initUI(handlers) {
  const diaSlider = $('dia-slider'), velSlider = $('vel-slider'), angSlider = $('ang-slider');
  const compSel = $('comp-select');
  const diaInput = $('dia-input'), velInput = $('vel-input'), angInput = $('ang-input');
  const densityInput = $('density-input'), waterInput = $('water-input'), obsInput = $('obs-input');
  const numericInputs = [diaInput, velInput, angInput, densityInput, waterInput, obsInput];
  obsInput.max = String(MAX_DISTANCE / 1000);
  let inputsValid = true;

  for (const [key, c] of Object.entries(COMPOSITIONS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${c.label} (${num(c.density)} kg/m³)`;
    compSel.appendChild(opt);
  }
  const custom = document.createElement('option');
  custom.value = 'custom'; custom.textContent = 'Custom density'; compSel.appendChild(custom);
  compSel.value = 'rock';

  const targetSel = $('target-select');
  for (const [key, t] of Object.entries(TARGETS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = t.label;
    targetSel.appendChild(opt);
  }
  targetSel.value = 'sedimentary';

  // Observer distance: log slider, 1 km – 20,000 km (antipode).
  const obsSlider = $('obs-slider');
  const obsFromSlider = (t) => 1000 * (MAX_DISTANCE / 1000) ** (t / 1000);
  let lastRes = null;
  function refreshObserver() {
    const r = Math.min(MAX_DISTANCE, Number(obsInput.value) * 1000);
    $('obs-val').textContent = fmtLen(r) + ' away';
    $('observer-readouts').innerHTML = renderObserver(lastRes, r);
    handlers.onObserver?.(r);
  }
  obsSlider.addEventListener('input', () => {
    obsInput.value = String(obsFromSlider(Number(obsSlider.value)) / 1000);
    onChange();
  });
  obsInput.addEventListener('input', () => {
    if (!validateControls()) return;
    obsSlider.value = String(1000 * Math.log(Math.max(1000, Number(obsInput.value) * 1000) / 1000) / Math.log(MAX_DISTANCE / 1000));
    onChange();
  });

  const presetsEl = $('presets');
  let selectedId = null;
  const cityBar = $('city-bar');
  const eventNote = $('event-note');

  function setEventNote(p) {
    if (!p) { eventNote.hidden = true; eventNote.innerHTML = ''; return; }
    const crater = p.craterKm != null
      ? ` · observed crater estimate ${p.craterKm < 1 ? (p.craterKm * 1000).toFixed(0) + ' m' : p.craterKm + ' km'}`
      : '';
    eventNote.hidden = false;
    eventNote.innerHTML = `<strong>${p.name}</strong> · ${p.when}<br>${p.where}${crater}<br>${p.blurb}<p class="model-intro">Preset inputs are illustrative, not a fitted reconstruction.</p>${(p.sources ?? []).map((source) => `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.label}</a>`).join(' · ')}`;
  }

  function showCities(show) {
    cityBar.hidden = !show;
    cityBar.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
  }

  function applyEvent(p, { city } = {}) {
    selectedId = p.id;
    presetsEl.querySelectorAll('.chip[data-id]').forEach((b) => {
      b.classList.toggle('on', b.dataset.id === p.id);
    });
    diaInput.value = String(p.diameter);
    velInput.value = String(p.velocity / 1000);
    angInput.value = String(p.angleDeg);
    densityInput.value = String(COMPOSITIONS[p.comp].density);
    compSel.value = p.comp;
    targetSel.value = p.target ?? 'sedimentary';
    waterInput.value = String(p.waterDepth ?? TARGETS[targetSel.value].waterDepth ?? 0);
    $('water-control').hidden = !TARGETS[targetSel.value].waterDepth;
    syncSliders();
    setEventNote(p);
    showCities(!!p.pickCity);
    if (p.lat != null && p.lon != null) handlers.onGroundZero?.(p.lat, p.lon);
    if (city) handlers.onGroundZero?.(city.lat, city.lon);
    onChange();
    $('launch-btn').classList.add('pulse');
    const url = new URL(window.location.href);
    url.searchParams.set('p', p.id);
    history.replaceState(null, '', url);
  }

  for (const era of ERA_ORDER) {
    const group = CATALOG.filter((e) => e.era === era);
    if (!group.length) continue;
    const label = document.createElement('div');
    label.className = 'era-label';
    label.textContent = ERA_LABELS[era];
    presetsEl.appendChild(label);
    const row = document.createElement('div');
    row.className = 'era-row';
    for (const p of group) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.id = p.id;
      b.textContent = p.name.replace(' (Moon-forming)', '');
      b.title = `${p.when} · ${p.where}`;
      b.addEventListener('click', () => applyEvent(p));
      row.appendChild(b);
    }
    presetsEl.appendChild(row);
  }

  for (const city of CITIES) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = city.name;
    b.addEventListener('click', () => {
      cityBar.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
      b.classList.add('on');
      handlers.onGroundZero?.(city.lat, city.lon);
    });
    cityBar.appendChild(b);
  }

  function params() {
    return {
      diameter: Number(diaInput.value), velocity: Number(velInput.value) * 1000,
      angleDeg: Number(angInput.value), density: Number(densityInput.value),
      target: targetSel.value, waterDepth: Number(waterInput.value),
    };
  }

  function validateControls() {
    const bad = numericInputs.find((el) => !el.validity.valid);
    inputsValid = !bad;
    for (const el of numericInputs) el.setAttribute('aria-invalid', String(!el.validity.valid));
    $('input-error').hidden = inputsValid;
    $('input-error').textContent = bad ? `${bad.labels[0].textContent.trim()}: enter a value from ${bad.min} to ${bad.max}.` : '';
    $('export-btn').disabled = !inputsValid;
    $('pin-btn').disabled = !inputsValid;
    $('launch-btn').disabled = !inputsValid || !handlers.onLaunch;
    if (!inputsValid) $('readout-title').textContent = 'Last valid estimate · fix inputs';
    return inputsValid;
  }

  function syncSliders() {
    diaSlider.value = sliderFromDia(Number(diaInput.value));
    velSlider.value = velInput.value;
    angSlider.value = angInput.value;
  }

  function clearEvent() {
    selectedId = null;
    presetsEl.querySelectorAll('.chip[data-id]').forEach((b) => b.classList.remove('on'));
    setEventNote(null); showCities(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('p');
    history.replaceState(null, '', url);
  }

  function onChange() {
    if (!validateControls()) return;
    const p = params();
    $('dia-val').textContent = fmtLen(p.diameter);
    $('vel-val').textContent = `${(p.velocity / 1000).toLocaleString('en-US', { maximumFractionDigits: 4 })} km/s`;
    $('ang-val').textContent = `${p.angleDeg}°`;
    handlers.onChange(p);
  }

  for (const [slider, input, convert] of [
    [diaSlider, diaInput, diaFromSlider], [velSlider, velInput, (v) => v], [angSlider, angInput, (v) => v],
  ]) {
    slider.addEventListener('input', () => {
      input.value = String(convert(Number(slider.value))); clearEvent(); onChange();
    });
  }
  for (const input of [diaInput, velInput, angInput, densityInput, waterInput]) {
    input.addEventListener('input', () => {
      if (input === densityInput) compSel.value = 'custom';
      clearEvent();
      if (validateControls()) { syncSliders(); onChange(); }
    });
  }
  compSel.addEventListener('input', () => {
    if (COMPOSITIONS[compSel.value]) densityInput.value = String(COMPOSITIONS[compSel.value].density);
    clearEvent(); onChange();
  });
  targetSel.addEventListener('input', () => {
    waterInput.value = String(TARGETS[targetSel.value].waterDepth ?? 0);
    $('water-control').hidden = !TARGETS[targetSel.value].waterDepth;
    clearEvent(); onChange();
  });
  $('export-btn').addEventListener('click', () => {
    if (!validateControls() || !lastRes) return;
    const report = createAssessmentReport(lastRes.inputs, Math.min(MAX_DISTANCE, Number(obsInput.value) * 1000),
      { event: selectedId ? eventById(selectedId) : null });
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `impact-assessment-${MODEL_VERSION}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $('launch-btn').addEventListener('click', () => {
    if (!validateControls()) return;
    $('launch-btn').classList.remove('pulse');
    $('readout-title').textContent = 'Scenario estimate';
    handlers.onLaunch(params());
  });
  $('reset-btn').addEventListener('click', handlers.onResetPlanet);
  $('cinematic-btn').addEventListener('click', handlers.onCinematic);
  $('truescale-chk').addEventListener('change', (e) => handlers.onTrueScale(e.target.checked));

  const timeSlider = $('time-slider');
  timeSlider.addEventListener('input', () => {
    const v = Number(timeSlider.value);
    $('time-val').textContent = v === 0 ? 'paused' : `${v.toFixed(2)}×`;
    $('play-btn').textContent = v === 0 ? '⏵' : '❚❚';
    handlers.onTimeScale(v);
  });

  // Timeline scrubber.
  const scrub = $('scrub-slider');
  let scrubDuration = 40;
  let scrubbing = false;
  scrub.addEventListener('pointerdown', () => { scrubbing = true; });
  scrub.addEventListener('pointerup', () => { scrubbing = false; });
  scrub.addEventListener('pointercancel', () => { scrubbing = false; });
  scrub.addEventListener('change', () => { scrubbing = false; });
  scrub.addEventListener('input', () => {
    const tau = (Number(scrub.value) / Number(scrub.max)) * scrubDuration;
    $('scrub-time').textContent = `${tau.toFixed(1)} s`;
    handlers.onScrub?.(tau);
  });
  $('play-btn').addEventListener('click', () => handlers.onPlayPause?.());

  // Comparison tray: pin the currently displayed forecast/result.
  const pinned = [];
  function cmpHeadline(res) {
    if (res.regime === 'airburst') return ['Outcome', `airburst @ ${fmtLen(res.burstAlt ?? 0)}`];
    if (res.regime === 'crater') {
      if (!res.crater) return ['Outcome', 'ground effects unresolved'];
      return ['Crater', fmtLen(res.crater.Dfr)];
    }
    return ['Outcome', res.giant.outcome];
  }
  function renderCompare() {
    const tray = $('compare-tray');
    tray.innerHTML = '';
    pinned.forEach((res, idx) => {
      const card = document.createElement('div');
      card.className = 'cmp-card';
      const [hl, hv] = cmpHeadline(res);
      const sev = res.regime === 'giant'
        ? { level: 5, label: `GIANT — ${res.giant.outcome}` } : res.severity;
      card.innerHTML = `
        <button class="cmp-x" title="Remove">✕</button>
        <h3>${fmtLen(res.diameter)} · ${(res.velocity / 1000).toFixed(0)} km/s · ${res.angleDeg}°</h3>
        <div class="cmp-row"><span>Energy</span><span>${sci(res.energyMt)} Mt</span></div>
        <div class="cmp-row"><span>${hl}</span><span>${hv}</span></div>
        <div class="cmp-row"><span>vs Chicxulub</span><span>${res.chicxulubs >= 0.01 ? '×' + num(res.chicxulubs, 2) : 'tiny'}</span></div>
        <div class="badge sev-${sev.level}">${sev.label}</div>`;
      card.querySelector('.cmp-x').addEventListener('click', () => {
        pinned.splice(idx, 1);
        renderCompare();
      });
      tray.appendChild(card);
    });
  }
  $('pin-btn').addEventListener('click', () => {
    if (!lastRes) return;
    pinned.push(lastRes);
    if (pinned.length > 4) pinned.shift();
    renderCompare();
  });

  let hintTimer = null;
  const defaultHint = $('hint').textContent;

  function refreshModel(res) {
    const notes = modelNotes(res);
    $('model-notes').innerHTML = `<p>Model ${MODEL_VERSION} · analytical estimates</p><ul>${notes.map((n) => `<li>${n.text}</li>`).join('')}</ul><p>${SOURCES.map((source) => `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.label}</a>`).join('<br>')}</p>`;
    const cases = diameterSensitivity(res.inputs);
    $('sensitivity-readouts').innerHTML = `<table><thead><tr><th>Diameter</th><th>Energy (Mt)</th><th>Outcome</th></tr></thead><tbody>${cases.map((c) => `<tr><td>${fmtLen(c.diameter)}</td><td>${sci(c.energyMt)}</td><td>${c.regime === 'airburst' ? 'airburst' : c.giantOutcome ?? (c.craterDiameter ? fmtLen(c.craterDiameter) + ' crater' : 'unresolved')}</td></tr>`).join('')}</tbody></table>`;
    const event = selectedId && eventById(selectedId);
    if (event?.craterKm != null) {
      $('readouts').insertAdjacentHTML('beforeend', row('Observed crater estimate', fmtLen(event.craterKm * 1000)) +
        row('', res.crater ? `model / observation ≈ ${(res.crater.Dfr / (event.craterKm * 1000)).toFixed(2)}; inputs are not calibrated` : 'this simplified model does not reproduce a resolved crater for these inputs', 'sub'));
    }
  }

  const ui = {
    clearEvent() { clearEvent(); onChange(); },
    refreshControls: validateControls,
    setPhase(text) { $('phase-label').textContent = text; },
    flashHint(text) {
      $('hint').textContent = text;
      $('cinematic-btn').classList.add('pulse');
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => {
        $('hint').textContent = defaultHint;
        $('cinematic-btn').classList.remove('pulse');
      }, 4000);
    },
    setCamMode(mode) {
      $('cinematic-btn').classList.toggle('active', mode === 'auto');
    },
    hideTimeline() { $('timeline').hidden = true; },
    setTimeline(duration, events) {
      scrubDuration = duration;
      $('timeline').hidden = false;
      const marks = $('timeline-marks');
      marks.innerHTML = '';
      for (const e of events) {
        if (e.t < 0 || e.t > duration) continue;
        const m = document.createElement('div');
        m.className = `tl-mark ${e.label}`;
        m.style.left = `${(e.t / duration) * 100}%`;
        m.title = e.label;
        marks.appendChild(m);
      }
    },
    setTimelineTime(tau) {
      if (scrubbing) return;
      const v = Math.min(1, tau / scrubDuration);
      scrub.value = String(Math.round(v * Number(scrub.max)));
      $('scrub-time').textContent = `${Math.min(tau, scrubDuration).toFixed(1)} s`;
    },
    setTimeScale(v) {
      timeSlider.value = String(v);
      $('time-val').textContent = v === 0 ? 'paused' : `${v.toFixed(2)}×`;
      $('play-btn').textContent = v === 0 ? '⏵' : '❚❚';
    },
    setForecast(res, exaggeration) {
      lastRes = res;
      $('readout-title').textContent = 'Scenario estimate';
      $('readouts').innerHTML = renderReadout(res);
      refreshModel(res);
      $('exag-note').textContent = exaggeration > 1.05
        ? `impactor shown ×${num(exaggeration)} actual size`
        : 'impactor shown at true scale';
      refreshObserver();
    },
    showResults(res) {
      // A running animation must not replace a newer edited forecast.
      if (!inputsValid || Object.entries(res.inputs).some(([key, value]) => params()[key] !== value)) return;
      lastRes = res;
      $('readout-title').textContent = 'Launched scenario estimate';
      $('readouts').innerHTML = renderReadout(res);
      refreshModel(res);
      refreshObserver();
      const panel = $('readout-panel');
      panel.classList.remove('hit');
      void panel.offsetWidth; // restart the highlight animation
      panel.classList.add('hit');
    },
  };

  // Deferred so the caller's reference to this ui object exists before the
  // first onChange round-trips back into it.
  queueMicrotask(() => {
    syncSliders();
    obsSlider.value = String(1000 * Math.log(Number(obsInput.value)) / Math.log(MAX_DISTANCE / 1000));
    onChange();
    const wanted = new URLSearchParams(window.location.search).get('p');
    const ev = wanted && eventById(wanted);
    if (ev) applyEvent(ev);
  });
  ui.setPhase('Standing by');
  ui.setCamMode('auto');
  return ui;
}
