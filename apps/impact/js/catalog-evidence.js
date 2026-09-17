// Source scope is explicit: a crater measurement does not validate its projectile inputs.
export const CATALOG_VERSION = '2026-09-05.1';
const source = (id, label, url, scope) => ({ id, label, url, scope });
const EID = source('eid', 'Earth Impact Database · NASA ARES archived table', 'https://ares.jsc.nasa.gov/interaction/lmdp/documents/EarthImpactDatabase_Part5A.pdf', 'Legacy structure dimensions; not projectile parameters or a current age catalog.');
const MOON = source('moon', 'NASA · Moon facts', 'https://science.nasa.gov/moon/facts/', 'Lunar size and the giant-impact hypothesis; not a specific simulated collision.');
const SOURCES = {
  chelyabinsk: [source('chely', 'LLNL · Chelyabinsk reconstruction (2023)', 'https://www.llnl.gov/article/49571/high-fidelity-simulation-offers-insight-2013-chelyabinsk-meteor', 'Approximately 20 m body and reconstructed airburst context.')],
  tunguska: [source('tunguska', 'NASA · Tunguska history', 'https://www.nasa.gov/history/115-years-ago-the-tunguska-asteroid-impact-event/', 'Historical airburst evidence; size and trajectory remain reconstruction-dependent.')],
  'sikhote-alin': [source('sikhote', 'Meteoritical Bulletin · Sikhote-Alin', 'https://www.lpi.usra.edu/meteor/metbull.php?code=23593', 'Observed 1947 fall and iron classification; not the original body diameter or largest pit size.')],
  barringer: [EID], 'wolfe-creek': [source('wolfe', 'Barrows team · Wolfe Creek dating (2019)', 'https://www.port.ac.uk/news-events-and-blogs/news/wolfe-creek-crater-younger-than-previously-thought', 'Revised age near 120 ka.'), source('wolfe-size', 'NASA · Wolfe Creek', 'https://science.nasa.gov/earth/earth-observatory/wolfe-creek-crater-8488/', 'Approximately 880 m crater diameter; the old age on this page is superseded.')],
  lonar: [EID, source('lonar-age', 'Jourdan et al. (2011) · Lonar dating', 'https://doi.org/10.1130/G31888.1', '570 ± 47 ka isotopic age; other dating methods have produced younger estimates.')],
  bosumtwi: [EID], eltanin: [source('eltanin', 'Gersonde et al. (1997) · Eltanin', 'https://pubmed.ncbi.nlm.nih.gov/11536816/', 'Sedimentary impact evidence and reconstruction; no measured crater diameter used.')],
  ries: [EID], popigai: [EID],
  chesapeake: [source('chesapeake', 'USGS · Chesapeake Bay impact', 'https://pubs.usgs.gov/fs/fs49-98/', '85 km outer structure from geophysical profiles; differs from the inner basin.')],
  hiawatha: [source('hiawatha', 'Kenny et al. (2022)', 'https://doi.org/10.1126/sciadv.abm2434', 'Late Paleocene crater age; does not establish the preset iron projectile.')],
  chicxulub: [source('chicxulub', 'Collins et al. (2020) · Chicxulub trajectory', 'https://www.nature.com/articles/s41467-020-15269-x', 'Reconstructed 45–60° trajectory; the full preset is not that numerical model.'), source('chicxulub-size', 'Whalen et al. (2020) · Chicxulub crater', 'https://www.sciencedirect.com/science/article/pii/S0025322720302565', 'Approximately 180 km inner-rim diameter.')],
  nadir: [source('nadir', 'Nicholson et al. (2024)', 'https://www.nature.com/articles/s43247-024-01700-4', 'Seismic reconstruction and inferred water depth near 800 m; crater extent depends on the chosen boundary.')],
  manicouagan: [source('manicouagan', 'NASA · Manicouagan (2022)', 'https://science.nasa.gov/earth/earth-observatory/a-modern-lake-in-an-ancient-crater-149414/', 'Original diameter estimated near 100 km; modern eroded extent is smaller.')],
  morokweng: [EID], sudbury: [source('sudbury', 'Meteoritical Bulletin · Sudbury', 'https://www.lpi.usra.edu/meteor/metbull.php?code=35310', '130 km database structure extent and age; not a unique reconstruction of the original crater.')],
  vredefort: [source('vredefort', 'NASA · Vredefort', 'https://science.nasa.gov/earth/earth-observatory/vredefort-crater-92689/', 'Original diameter estimated at 180–300 km; 300 km is the upper end, not an exact measurement.')],
  acraman: [EID],
  apophis: [source('apophis', 'NASA · Apophis facts', 'https://science.nasa.gov/solar-system/asteroids/apophis-facts/', 'Mean diameter about 340 m; elongated shape. The 2029 passage is a flyby.')],
  bennu: [source('bennu-size', 'NASA · Bennu facts', 'https://science.nasa.gov/solar-system/asteroids/101955-bennu/facts/', 'Approximately 500 m rubble-pile asteroid; preset 490 m is an illustrative size.'), source('bennu-orbit', 'NASA/JPL · Bennu orbit (2021)', 'https://www.jpl.nasa.gov/news/nasa-spacecraft-provides-insight-into-asteroid-bennus-future-orbit/', 'Dated probability estimate through 2300; not the probability of this hypothetical scenario.')],
  ceres: [source('ceres', 'NASA · Ceres facts', 'https://science.nasa.gov/dwarf-planets/ceres/facts/', 'Radius about 476 km; the 940 km preset is a size analogy, not a Ceres mass/composition model.')],
  moon: [MOON], theia: [MOON],
  'hit-and-run': [source('genda', 'Genda, Kokubo & Ida (2012)', 'https://arxiv.org/abs/1109.4330', 'Giant-collision merger criterion; the preset is a hypothetical example, not an observed event.')],
};
const CRATER_DEFINITIONS = {
  'sikhote-alin': 'Illustrative largest pit in a fragment field; not a single crater from the whole incoming body. Pit size source verification remains pending.',
  chesapeake: 'Outer disturbed structure; not the inner crater alone.',
  chicxulub: 'Geophysically reconstructed inner-rim diameter.',
  hiawatha: 'Buried geophysical structure.', nadir: 'Legacy 8.5 km structure estimate; boundary definitions differ in later seismic work.',
  manicouagan: 'Estimated original crater, not the modern reservoir diameter.',
  sudbury: 'Database structure extent of an eroded, deformed basin; original crater is uncertain.',
  vredefort: 'Upper end of a published 180–300 km reconstruction range.',
  acraman: 'Reconstructed extent of an eroded impact structure.',
};
const estimated = (detail, sourceIds) => ({ status: 'estimated', detail, sourceIds });
export function addCatalogEvidence(event) {
  const sources = SOURCES[event.id];
  if (!sources) throw new Error(`Missing catalog provenance: ${event.id}`);
  const parameters = Object.fromEntries(['diameter', 'density', 'velocity', 'angleDeg', 'target', 'waterDepth'].map((key) => [key,
    { status: 'assumed', detail: 'Illustrative model input; no event-specific measurement asserted.', sourceIds: [] }]));
  parameters.density.detail = 'Composition-class model density; not a measured bulk density for this event.';
  parameters.target.detail = 'Homogeneous target approximation; map coordinates do not supply geology.';
  parameters.waterDepth.detail = 'Application target default unless explicitly specified; not a bathymetry lookup.';
  if (event.id === 'apophis') parameters.diameter = estimated('Rounded mean diameter from NASA; shape is not spherical.', ['apophis']);
  if (event.id === 'chelyabinsk') parameters.diameter = estimated('Approximate reconstructed diameter, not a directly measured sphere.', ['chely']);
  if (event.id === 'chicxulub') parameters.angleDeg = estimated('60° selected from a reconstructed 45–60° range.', ['chicxulub']);
  if (event.id === 'nadir') parameters.waterDepth = estimated('About 800 m inferred from seismic stratigraphy.', ['nadir']);
  if (event.id === 'sikhote-alin') parameters.diameter.detail = '10 m is the application minimum; this preset does not resolve the actual fragmented fall.';
  return { ...event, sources, evidence: {
    catalogVersion: CATALOG_VERSION, reviewedOn: '2026-09-05',
    kind: event.era === 'planetary' ? 'hypothetical' : 'historical',
    parameters, craterDefinition: event.craterKm == null ? null : CRATER_DEFINITIONS[event.id] ?? 'Reported structure diameter, rounded; not a measured projectile size.',
    craterRangeKm: event.id === 'vredefort' ? [180, 300] : null,
    note: 'Sources support only their stated scope. Unknown input uncertainties remain unknown; sensitivity settings are not evidence-based parameter ranges.',
  } };
}
