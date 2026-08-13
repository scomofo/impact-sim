// ui.js — control panel, presets, and physics readouts. No framework.
import { COMPOSITIONS, PRESETS, TARGETS, observerReport } from './physics.js';

const $ = (id) => document.getElementById(id);

// Diameter slider is logarithmic: 10 m .. 7420 km (Theia).
const DIA_LOG_MIN = 1;       // log10(10 m)
const DIA_LOG_MAX = 6.8704;  // log10(7420 km)
const diaFromSlider = (t) => 10 ** (DIA_LOG_MIN + (t / 1000) * (DIA_LOG_MAX - DIA_LOG_MIN));
const sliderFromDia = (d) => Math.round(((Math.log10(d) - DIA_LOG_MIN) / (DIA_LOG_MAX - DIA_LOG_MIN)) * 1000);

// --- formatting -------------------------------------------------------------
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function sci(n, digits = 1) {
  if (!isFinite(n)) return '—';
  if (n === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(n)));
  const m = n / 10 ** e;
  const sup = String(e).split('').map((c) => SUP[c]).join('');
  return `${m.toFixed(digits)}×10${sup}`;
}
function num(n, digits = 0) {
  if (!isFinite(n)) return '—';
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
  if (!isFinite(s)) return '—';
  if (s < 90) return `${s.toFixed(0)} s`;
  if (s < 5400) return `${(s / 60).toFixed(0)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}
function fmtYears(y) {
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

function renderReadout(res) {
  const rows = [];
  rows.push(row('Mass', `${sci(res.mass)} kg`));
  rows.push(row('Energy', fmtEnergy(res)));
  rows.push(row('', compareLine(res.energyMt), 'sub'));

  if (res.regime === 'airburst') {
    rows.unshift(badge('AIRBURST — breaks up in atmosphere', 0));
    rows.push(row('Breaks up at', fmtLen(res.breakupAlt ?? 0) + ' altitude'));
    rows.push(row('Detonates at', fmtLen(res.burstAlt ?? 0) + ' altitude'));
    rows.push(row('Energy at burst', `${sci(res.burstEnergyMt)} Mt TNT`));
    rows.push(row('Crater', 'none — atmospheric detonation'));
    rows.push(row('How often on Earth', fmtYears(res.recurrence)));
    return rows.join('');
  }

  if (res.regime === 'crater') {
    rows.unshift(badge(res.severity.label, res.severity.level));
    const c = res.crater;
    if (res.vSurface < res.velocity * 0.97) {
      rows.push(row('Slowed by atmosphere', `hits at ${(res.vSurface / 1000).toFixed(1)} km/s`));
    }
    if (res.waterCrater) {
      rows.push(row('Water cavity', `${fmtLen(res.waterCrater)} across, blasted in the ocean`));
      if (res.tsunami) rows.push(row('', 'major tsunami radiates outward', 'sub highlight'));
    }
    if (res.seafloorStopped) {
      rows.push(row('Seafloor crater', 'none — the ocean stops it'));
    } else {
      rows.push(row(res.basin ? 'Impact basin' : res.waterCrater ? 'Seafloor crater' : 'Final crater',
        `${fmtLen(c.Dfr)} across · ${fmtLen(c.depth)} deep`));
      rows.push(row('', res.basin ? 'planet-scarring basin (scaling stretched)'
        : c.isComplex ? 'complex crater (central peak, terraces)' : 'simple bowl crater', 'sub'));
    }
    rows.push(row('Fireball radius', res.fireball ? fmtLen(res.fireball) : 'no vapor fireball (< 15 km/s)'));
    if (res.burn) rows.push(row('3rd-degree burns within', fmtLen(res.burn)));
    rows.push(row('Earthquake', `M ${res.seismic.toFixed(1)}`));
    if (res.melt > 0) rows.push(row('Rock melted', `${sci(res.melt / 1e9)} km³`));
    rows.push(row('How often on Earth', fmtYears(res.recurrence)));
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
  if (g.merged && g.dayHours) rows.push(row('Day length after', `${g.dayHours.toFixed(1)} h`));
  rows.push(row('Mantle melted', g.magmaOcean ? `global magma ocean (${(g.meltFraction * 100).toFixed(0)}%)` : `${(g.meltFraction * 100).toFixed(0)}% — partial`));
  if (g.synestia) rows.push(row('Post-impact body', 'synestia — vaporized donut world', 'highlight'));
  if (g.moonForming) {
    rows.push(row('Debris disk', `≈ ${g.diskMoons.toFixed(1)} lunar masses — a moon forms`, 'highlight'));
  } else if (g.diskMoons > 0.05) {
    rows.push(row('Debris disk', `≈ ${g.diskMoons.toFixed(2)} lunar masses`));
  }
  if (g.outcome === 'hit-and-run') rows.push(row('Projectile', 'survives, escapes mangled'));
  return rows.join('');
}

// Observer panel: what happens at distance r (m) for the last-computed result.
function renderObserver(res, r) {
  if (!res) return '';
  const o = observerReport(res, r);
  const rows = [];
  if (o.giant) {
    rows.push(badge('Nowhere on Earth is safe', 5));
    return rows.join('');
  }
  if (o.insideCrater) {
    rows.push(badge('Inside the crater — instantly vaporized', 5));
    return rows.join('');
  }
  if (o.insideFireball) rows.push(badge('Inside the fireball — vaporized', 5));
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
    rows.push(row('', `${o.blast.damage ?? 'rattles, minor damage'}${o.blast.unreliable ? ' (high-airburst estimate, rough)' : ''} · arrives ${fmtTime(o.blast.arrival)}`, 'sub'));
  }
  if (o.seismic && o.seismic.Meff > 0) {
    rows.push(row('Ground shaking', `feels like M ${o.seismic.Meff.toFixed(1)}`));
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
  return rows.join('');
}

// --- init -------------------------------------------------------------------
export function initUI(handlers) {
  const diaSlider = $('dia-slider'), velSlider = $('vel-slider'), angSlider = $('ang-slider');
  const compSel = $('comp-select');

  for (const [key, c] of Object.entries(COMPOSITIONS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${c.label} (${num(c.density)} kg/m³)`;
    compSel.appendChild(opt);
  }
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
  const obsFromSlider = (t) => 1000 * 10 ** ((t / 1000) * 4.301);
  let lastRes = null;
  function refreshObserver() {
    const r = obsFromSlider(Number(obsSlider.value));
    $('obs-val').textContent = fmtLen(r) + ' away';
    $('observer-readouts').innerHTML = renderObserver(lastRes, r);
    handlers.onObserver?.(r);
  }
  obsSlider.addEventListener('input', refreshObserver);

  const presetsEl = $('presets');
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = p.name;
    b.addEventListener('click', () => {
      diaSlider.value = sliderFromDia(p.diameter);
      velSlider.value = p.velocity / 1000;
      angSlider.value = p.angleDeg;
      compSel.value = p.comp;
      onChange();
      $('launch-btn').classList.add('pulse');
    });
    presetsEl.appendChild(b);
  }

  function params() {
    const comp = compSel.value;
    return {
      diameter: diaFromSlider(Number(diaSlider.value)),
      velocity: Number(velSlider.value) * 1000,
      angleDeg: Number(angSlider.value),
      comp,
      density: COMPOSITIONS[comp].density,
      target: targetSel.value,
    };
  }

  function onChange() {
    const p = params();
    $('dia-val').textContent = fmtLen(p.diameter);
    $('vel-val').textContent = `${(p.velocity / 1000).toFixed(1)} km/s`;
    $('ang-val').textContent = `${p.angleDeg}°`;
    handlers.onChange(p);
  }

  for (const el of [diaSlider, velSlider, angSlider, compSel, targetSel]) {
    el.addEventListener('input', onChange);
  }

  $('launch-btn').addEventListener('click', () => {
    $('launch-btn').classList.remove('pulse');
    $('readout-title').textContent = 'Impact forecast';
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
      if (res.seafloorStopped) return ['Outcome', 'stopped by ocean'];
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

  const ui = {
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
      $('readout-title').textContent = 'Impact forecast';
      $('readouts').innerHTML = renderReadout(res);
      $('exag-note').textContent = exaggeration > 1.05
        ? `impactor shown ×${num(exaggeration)} actual size`
        : 'impactor shown at true scale';
      refreshObserver();
    },
    showResults(res) {
      lastRes = res;
      $('readout-title').textContent = 'Impact results';
      $('readouts').innerHTML = renderReadout(res);
      refreshObserver();
      const panel = $('readout-panel');
      panel.classList.remove('hit');
      void panel.offsetWidth; // restart the highlight animation
      panel.classList.add('hit');
    },
  };

  // Deferred so the caller's reference to this ui object exists before the
  // first onChange round-trips back into it.
  queueMicrotask(onChange);
  ui.setPhase('Standing by');
  ui.setCamMode('auto');
  return ui;
}
