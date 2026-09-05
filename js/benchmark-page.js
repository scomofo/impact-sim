import { BENCHMARKS, runBenchmarks } from './benchmarks.js';

const labels = { 'within-tolerance': 'Within 3% display tolerance', review: 'Review discrepancy', 'not-comparable': 'Not comparable' };
const format = (n) => n === null ? 'Unavailable' : n === 0 ? '0' : Math.abs(n) >= 1e6 || Math.abs(n) < 0.01 ? n.toExponential(3) : Number(n.toPrecision(5)).toLocaleString('en-US', { maximumSignificantDigits: 5 });
export function initBenchmarks(root = document) {
  const filter = root.getElementById('benchmark-filter'), results = root.getElementById('benchmark-results');
  for (const b of BENCHMARKS) { const option = root.createElement('option'); option.value = b.id; option.textContent = b.name; filter.append(option); }
  let report;
  function render() {
    const selected = report.cases.filter((c) => filter.value === 'all' || c.id === filter.value);
    results.replaceChildren();
    for (const c of selected) {
      const section = root.createElement('section'); section.className = 'benchmark-case';
      section.innerHTML = `<h2>${c.name}</h2><p>${c.inputs.diameter} m · ${c.inputs.density} kg/m³ · ${c.inputs.velocity / 1000} km/s · ${c.inputs.angleDeg}° · ${c.inputs.target} target · observer at 200 km</p><div class="table-wrap" tabindex="0" role="region" aria-label="${c.name} comparison"><table><caption>Model ${report.modelVersion} compared with published references</caption><thead><tr><th scope="col">Quantity</th><th scope="col">Reference</th><th scope="col">Model</th><th scope="col">Difference</th><th scope="col">Assessment</th></tr></thead><tbody></tbody></table></div>`;
      for (const m of c.metrics) {
        const tr = root.createElement('tr');
        const texts = [m.label + ' (' + m.unit + ')', format(m.reference), format(m.actual), m.percentDifference === null ? '—' : `${m.percentDifference >= 0 ? '+' : ''}${m.percentDifference.toFixed(2)}%`, labels[m.status]];
        for (let i = 0; i < texts.length; i++) {
          const td = root.createElement(i === 0 ? 'th' : 'td'); td.textContent = texts[i];
          if (i === 0) td.scope = 'row';
          if (i === 4) { td.className = m.status; if (m.note) { const note = root.createElement('small'); note.textContent = m.note; td.append(note); } }
          tr.append(td);
        }
        section.querySelector('tbody').append(tr);
      }
      if (c.error) { const p = root.createElement('p'); p.textContent = 'Calculation unavailable: ' + c.error; section.append(p); }
      results.append(section);
    }
    const metrics = selected.flatMap((c) => c.metrics);
    root.getElementById('benchmark-status').textContent = `${selected.length} examples · ${metrics.filter((m) => m.status === 'review').length} discrepancies to review · ${metrics.filter((m) => m.status === 'not-comparable').length} non-comparable values. No overall accuracy score.`;
  }
  function recalculate() { report = runBenchmarks(); render(); }
  filter.addEventListener('change', render);
  root.getElementById('benchmark-run').addEventListener('click', recalculate);
  root.getElementById('benchmark-export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const a = root.createElement('a'); a.href = url; a.download = 'impact-benchmarks.json'; root.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  recalculate();
}
if (typeof document !== 'undefined' && document.getElementById('benchmark-results')) initBenchmarks();
