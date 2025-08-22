// v3: static map, Friesland fix, overlays exact op NL-bbox, dikkere borders
const map = L.map('map', {
  zoomControl: false,
  scrollWheelZoom: false,
  doubleClickZoom: false,
  boxZoom: false,
  keyboard: false,
  dragging: false,
  touchZoom: false
}).setView([52.2, 5.3], 7);

let provincesLayer;
let dataByProv = new Map();
let dataByProvNorm = new Map();
let groups = {};
let currentGroup = null;
let currentMetric = null;
let activeOverlays = [];
let nlBounds = null; // ⬅ hier slaan we straks de NL-bounds op

// helper: normaliseer namen
const norm = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/-/g, ' ')
  .trim().toLowerCase();

// aliasmapping
const alias = new Map([
  ['fryslan', 'friesland'],
  ['brabant', 'noord brabant']
]);

function loadCSV() {
  return new Promise((resolve) => {
    Papa.parse('./data/provincies_circulaire_dataset.csv', {
      header: true, download: true, dynamicTyping: true,
      complete: (results) => {
        results.data.forEach(row => {
          const p = row['Provincie'];
          if (!p) return;
          const key = String(p).trim();
          const keyNorm = norm(key);
          dataByProv.set(key, row);
          dataByProvNorm.set(keyNorm, row);
        });
        resolve();
      }
    });
  });
}

async function loadGroups() {
  const res = await fetch('./data/metric_groups.json');
  groups = await res.json();
  const titles = { bedrijvigheid:'Bedrijvigheid', r_strategie:'R-strategie', instrumenten:'Instrumenten', overig:'Overig' };
  const groupSelect = document.getElementById('groupSelect');
  Object.keys(groups).forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = titles[g] || g;
    groupSelect.appendChild(opt);
  });
  groupSelect.addEventListener('change', () => {
    currentGroup = groupSelect.value; populateMetricSelect();
  });
  currentGroup = groupSelect.value || Object.keys(groups)[0];
  populateMetricSelect();
}

function prettifyMetric(key){
  const name = key.includes('__') ? key.split('__')[1] : key;
  return name.replaceAll('_',' ').replace(/\b\w/g, m => m.toUpperCase());
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

function numberOrDash(v){ return (v==null || isNaN(v)) ? '–' : Number(v).toLocaleString('nl-NL'); }

function rowForProv(nameRaw){
  if (dataByProv.has(nameRaw)) return dataByProv.get(nameRaw);

  let n = norm(nameRaw);
  if (dataByProvNorm.get(n)) return dataByProvNorm.get(n);

  const fwd = alias.get(n);
  if (fwd && dataByProvNorm.get(fwd)) return dataByProvNorm.get(fwd);

  for (const [src, dst] of alias.entries()){
    if (dst === n && dataByProvNorm.get(src)) return dataByProvNorm.get(src);
  }

  console.warn('Geen match voor provincie:', nameRaw, '| norm:', n);
  return null;
}

function attachPopup(layer, provName){
  const row = rowForProv(provName);
  if (!row) return;
  let html = `<div class="popup"><h3>${provName}</h3>`;
  const friendly = { bedrijvigheid:'Bedrijvigheid', r_strategie:'R-strategie', instrumenten:'Instrumenten', overig:'Overig' };
  Object.keys(groups).forEach(g => {
    html += `<div class="group">${friendly[g] || g}</div><table>`;
    (groups[g]||[]).forEach(k => { html += `<tr><th>${prettifyMetric(k)}</th><td>${numberOrDash(row[k])}</td></tr>`; });
    html += `</table>`;
  });
  html += `</div>`;
  layer.bindPopup(html);
}

function updateChoropleth(){
  if (!provincesLayer || !currentMetric) return;
  const vals = [];
  dataByProv.forEach(row => { const v = Number(row[currentMetric]); if (!isNaN(v)) vals.push(v); });
  const min = Math.min(...vals), max = Math.max(...vals);

  provincesLayer.eachLayer(layer => {
    const prop = layer.feature.properties || {};
    const raw = (prop.name || prop.Provincie || '').trim();
    const row = rowForProv(raw);
    const val = row ? Number(row[currentMetric]) : null;
    layer.setStyle({
      fillColor: kiaGreen(val, min, max),
      weight: 2.5,
      color: '#2e4039',
      fillOpacity: 0.45,
      opacity: 1
    });
    attachPopup(layer, row ? (row['Provincie'] || raw) : raw);
  });
}

function loadOverlays(){
  fetch('./data/overlays/index.json')
    .then(r => r.json())
    .then(items => {
      const list = document.getElementById('overlayList');
      list.innerHTML='';

      const sliderWrap = document.createElement('div');
      sliderWrap.style.margin = '6px 0';
      sliderWrap.innerHTML = `
        <label style="font-size:12px">Transparantie</label>
        <input id="overlayOpacity" type="range" min="30" max="100" value="85" />
      `;
      list.appendChild(sliderWrap);
      const setOpacity = v => activeOverlays.forEach(o => o.layer.setOpacity(v/100));
      sliderWrap.querySelector('#overlayOpacity').addEventListener('input', e => setOpacity(e.target.value));

      items.forEach(item => {
        const wrap = document.createElement('label'); wrap.className = 'overlay-item';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = item.id;
        cb.addEventListener('change', e => {
          if (e.target.checked){
            const boundsForImg = nlBounds || item.bounds;
            const img = L.imageOverlay(item.url, boundsForImg, {
              opacity: .85,
              interactive: false,
              className: 'hotspot-overlay'
            });
            img.addTo(map);
            if (img.bringToFront) img.bringToFront();
            activeOverlays.push({id:item.id, layer:img});
          } else {
            const i = activeOverlays.findIndex(o => o.id===item.id);
            if (i>-1){ map.removeLayer(activeOverlays[i].layer); activeOverlays.splice(i,1); }
          }
        });
        const span = document.createElement('span'); span.textContent = item.title;
        wrap.appendChild(cb); wrap.appendChild(span); list.appendChild(wrap);
      });

      if (!items.length){
        list.innerHTML = '<em>Geen overlays gevonden. Voeg <code>data/overlays/index.json</code> toe.</em>';
      }
    })
    .catch(()=>{});
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
      nlBounds = provincesLayer.getBounds(); // ⬅ sla bbox op
      map.fitBounds(nlBounds, { padding: [12,12] });
      updateChoropleth();
    })
    .catch(() => alert('Kon nl_provinces.geojson niet laden.'));

  loadOverlays();
}
init();
