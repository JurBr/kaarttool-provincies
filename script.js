// v4 template: provincies + campussen (Google Sheet) + overlays
const map = L.map('map', {
  zoomControl: false,
  scrollWheelZoom: false,
  doubleClickZoom: false,
  boxZoom: false,
  keyboard: false,
  dragging: false,
  touchZoom: false
}).setView([52.2, 5.3], 7);

// provincies dataset
let provincesLayer;
let dataByProv = new Map();
let groups = {};
let currentGroup = null;
let currentMetric = null;

// campussen dataset
const SHEET_CSV_URL = "REPLACE_WITH_GOOGLE_SHEET_CSV"; // <--- vul hier je Google Sheet CSV-link in

function loadCSV() {
  return new Promise((resolve) => {
    Papa.parse('./data/provincies_circulaire_dataset.csv', {
      header: true, download: true, dynamicTyping: true,
      complete: (results) => {
        results.data.forEach(row => {
          if (row['Provincie']) dataByProv.set(row['Provincie'], row);
        });
        resolve();
      }
    });
  });
}

async function loadGroups() {
  const res = await fetch('./data/metric_groups.json');
  groups = await res.json();
  const groupSelect = document.getElementById('groupSelect');
  Object.keys(groups).forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = g;
    groupSelect.appendChild(opt);
  });
  groupSelect.addEventListener('change', () => {
    currentGroup = groupSelect.value; populateMetricSelect();
  });
  currentGroup = groupSelect.value || Object.keys(groups)[0];
  populateMetricSelect();
}

function prettifyMetric(key){
  return key.replaceAll('_',' ').replace(/\b\w/g, m => m.toUpperCase());
}

function populateMetricSelect(){
  const metricSelect = document.getElementById('metricSelect');
  metricSelect.innerHTML = '';
  const ms = groups[currentGroup] || [];
  ms.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = prettifyMetric(m);
    metricSelect.appendChild(opt);
  });
  metricSelect.addEventListener('change', () => {
    currentMetric = metricSelect.value; updateChoropleth();
  }, { once: true });
  currentMetric = metricSelect.value || ms[0];
  updateChoropleth();
}

function kiaGreen(val, min, max){
  if (val == null || isNaN(val)) return '#eef3f1';
  const t = (val - min) / (max - min || 1);
  const r = Math.round(246 + t * (14 - 246));
  const g = Math.round(251 + t * (87 - 251));
  const b = Math.round(247 + t * (53 - 247));
  return `rgb(${r},${g},${b})`;
}

function updateChoropleth(){
  if (!provincesLayer || !currentMetric) return;
  const vals = [];
  dataByProv.forEach(row => { const v = Number(row[currentMetric]); if (!isNaN(v)) vals.push(v); });
  const min = Math.min(...vals), max = Math.max(...vals);

  provincesLayer.eachLayer(layer => {
    const prop = layer.feature.properties || {};
    const name = (prop.name || prop.Provincie || '').trim();
    const row = dataByProv.get(name);
    const val = row ? Number(row[currentMetric]) : null;
    layer.setStyle({
      fillColor: kiaGreen(val, min, max),
      weight: 2.5, color: '#2e4039',
      fillOpacity: 0.45, opacity: 1
    });
  });
}

// overlays
function loadOverlays(){
  fetch('./data/overlays/index.json')
    .then(r => r.json())
    .then(items => {
      const list = document.getElementById('overlayList');
      list.innerHTML='';
      items.forEach(item => {
        const wrap = document.createElement('label'); wrap.className = 'overlay-item';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = item.id;
        cb.addEventListener('change', e => {
          if (e.target.checked){
            const img = L.imageOverlay(item.url, item.bounds, { opacity: .85 });
            img.addTo(map); if (img.bringToFront) img.bringToFront();
          } else {
            map.eachLayer(l => { if (l instanceof L.ImageOverlay && l._url===item.url) map.removeLayer(l); });
          }
        });
        const span = document.createElement('span'); span.textContent = item.title;
        wrap.appendChild(cb); wrap.appendChild(span); list.appendChild(wrap);
      });
    })
    .catch(()=>{});
}

// campussen uit Google Sheet laden
function loadCampuses(){
  Papa.parse(SHEET_CSV_URL, {
    download: true, header: true, dynamicTyping: true,
    complete: (results) => {
      results.data.forEach(row => {
        if (!row.lat || !row.lng) return;
        const marker = L.marker([row.lat, row.lng], {title: row.naam});
        const html = `<h3>${row.naam}</h3><p>${row.beschrijving||''}</p>`;
        marker.bindPopup(html).addTo(map);
      });
    }
  });
}

async function init(){
  await loadCSV();
  await loadGroups();
  fetch('./data/nl_provinces.geojson')
    .then(r => r.json())
    .then(geojson => {
      provincesLayer = L.geoJSON(geojson, {
        style: { color: '#2e4039', weight: 2.5, fillOpacity: 0.45 }
      }).addTo(map);
      map.fitBounds(provincesLayer.getBounds(), { padding: [12,12] });
      updateChoropleth();
    });
  loadOverlays();
  loadCampuses();
}
init();