// v2: grouped filters, Montserrat + KIA-CE palette, no legend, click popup with all metrics
const map = L.map('map', { zoomControl: true }).setView([52.2, 5.3], 7);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors, © CARTO'
}).addTo(map);

let provincesLayer;
let dataByProv = new Map();
let groups = {};
let currentGroup = null;
let currentMetric = null;
let activeOverlays = [];

const aliases = new Map([
  ['Fryslân','Friesland'],
  ['Brabant','Noord-Brabant']
]);

function loadCSV() {
  return new Promise((resolve) => {
    Papa.parse('./data/provincies_circulaire_dataset.csv', {
      header: true, download: true, dynamicTyping: true,
      complete: (results) => {
        results.data.forEach(row => {
          if (!row['Provincie']) return;
          const key = String(row['Provincie']).trim();
          dataByProv.set(key, row);
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
    opt.value = g;
    opt.textContent = titles[g] || g;
    groupSelect.appendChild(opt);
  });
  groupSelect.addEventListener('change', () => {
    currentGroup = groupSelect.value;
    populateMetricSelect();
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
    opt.value = m;
    opt.textContent = prettifyMetric(m);
    metricSelect.appendChild(opt);
  });
  metricSelect.addEventListener('change', () => {
    currentMetric = metricSelect.value;
    updateChoropleth();
  }, { once: true });
  currentMetric = metricSelect.value || ms[0];
  updateChoropleth();
}

function kiaGreen(val, min, max){
  if (val == null || isNaN(val)) return '#f6fbf7'; // very light bg
  const t = (val - min) / (max - min || 1);
  const r = Math.round(246 + t * (14 - 246));
  const g = Math.round(251 + t * (87 - 251));
  const b = Math.round(247 + t * (53 - 247));
  return `rgb(${r},${g},${b})`;
}

function numberOrDash(v){
  if (v == null || isNaN(v)) return '–';
  return Number(v).toLocaleString('nl-NL');
}

function attachPopup(layer, provName){
  const row =
    dataByProv.get(provName) ||
    dataByProv.get(aliases.get(provName)) ||
    ( (() => {
        const k = [...dataByProv.keys()].find(k => aliases.get(k) === provName);
        return k ? dataByProv.get(k) : null;
      })() );

  if (!row) return;
  let html = `<div class="popup"><h3>${provName}</h3>`;
  const friendly = { bedrijvigheid:'Bedrijvigheid', r_strategie:'R-strategie', instrumenten:'Instrumenten', overig:'Overig' };
  Object.keys(groups).forEach(g => {
    html += `<div class="group">${friendly[g] || g}</div><table>`;
    (groups[g]||[]).forEach(k => {
      html += `<tr><th>${prettifyMetric(k)}</th><td>${numberOrDash(row[k])}</td></tr>`;
    });
    html += `</table>`;
  });
  html += `</div>`;
  layer.bindPopup(html);
}

function updateChoropleth(){
  if (!provincesLayer || !currentMetric) return;
  const vals = [];
  dataByProv.forEach(row => {
    const v = Number(row[currentMetric]);
    if (!isNaN(v)) vals.push(v);
  });
  const min = Math.min(...vals);
  const max = Math.max(...vals);

  provincesLayer.eachLayer(layer => {
    const prop = layer.feature.properties || {};
    let name = (prop.name || prop.Provincie || '').trim();
    if (aliases.has(name) && dataByProv.has(aliases.get(name))) name = aliases.get(name);
    const row = dataByProv.get(name);
    const val = row ? Number(row[currentMetric]) : null;
    layer.setStyle({
      fillColor: kiaGreen(val, min, max),
      weight: 1, color: '#64766e', fillOpacity: 0.9, opacity: 1
    });
    attachPopup(layer, name);
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
        <input id="overlayOpacity" type="range" min="20" max="100" value="65" />
      `;
      list.appendChild(sliderWrap);
      const setOpacity = (v) => activeOverlays.forEach(o => o.layer.setOpacity(v/100));
      sliderWrap.querySelector('#overlayOpacity').addEventListener('input', e => setOpacity(e.target.value));

      items.forEach(item => {
        const wrap = document.createElement('label');
        wrap.className = 'overlay-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.value = item.id;
        cb.addEventListener('change', e => {
          if (e.target.checked){
            const img = L.imageOverlay(item.url, item.bounds, {opacity: .65});
            img.addTo(map);
            activeOverlays.push({id:item.id, layer:img});
          } else {
            const i = activeOverlays.findIndex(o => o.id===item.id);
            if (i>-1){ map.removeLayer(activeOverlays[i].layer); activeOverlays.splice(i,1); }
          }
        });
        const span = document.createElement('span');
        span.textContent = item.title;
        wrap.appendChild(cb); wrap.appendChild(span);
        list.appendChild(wrap);
      });
      if (!items.length){
        list.innerHTML = '<em>Geen overlays gevonden. Voeg <code>data/overlays/index.json</code> toe.</em>';
      }
    })
    .catch(()=>{/* silent if missing */});
}

async function init(){
  await loadCSV();
  await loadGroups();

  fetch('./data/nl_provinces.geojson')
    .then(r => r.json())
    .then(geojson => {
      provincesLayer = L.geoJSON(geojson, {
        style: { color: '#64766e', weight: 1, fillOpacity: 0.9 }
      }).addTo(map);
      map.fitBounds(provincesLayer.getBounds(), { padding: [12,12] });
      updateChoropleth();
    })
    .catch(err => alert('Kon nl_provinces.geojson niet laden.'));

  loadOverlays();
}
init();
