function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function setProgress(pct) {
  const wrap = document.getElementById('progress-wrap');
  const bar = document.getElementById('progress-bar');
  if (pct < 0) { wrap.style.display='none'; return; }
  wrap.style.display = 'block';
  bar.style.width = pct + '%';
}

// ============================================================
// COUNTING
// ============================================================
function countResults(recs) {
  const c = { CRN:0, Refurbish:0, Auction:0, Recycle:0, Excluded:0, Unclassified:0, ERROR:0 };
  for (const r of recs) {
    if (r.allocationResult in c) c[r.allocationResult]++;
    else c.Unclassified++;
  }
  return c;
}

// ============================================================
// DASHBOARD UPDATE
// ============================================================
function updateDashboard() {
  const recs = state.processed;
  const total = recs.length;
  const counts = countResults(recs);
  const pct = k => total ? (counts[k]/total*100).toFixed(2)+'%' : '—';

  const set = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  const unclTotal = counts.Unclassified + (counts.ERROR||0);

  set('cnt-total', total.toLocaleString());
  set('pct-total', 'Total: ' + total.toLocaleString());
  set('cnt-crn', counts.CRN.toLocaleString());
  set('pct-crn', pct('CRN'));
  set('cnt-refurbish', counts.Refurbish.toLocaleString());
  set('pct-refurbish', pct('Refurbish'));
  set('cnt-auction', counts.Auction.toLocaleString());
  set('pct-auction', pct('Auction'));
  set('cnt-recycle', counts.Recycle.toLocaleString());
  set('pct-recycle', pct('Recycle'));
  set('cnt-excluded', counts.Excluded.toLocaleString());
  set('pct-excluded', pct('Excluded'));
  set('cnt-unclassified', unclTotal.toLocaleString());
  set('pct-unclassified', total ? (unclTotal/total*100).toFixed(2)+'%' : '—');

  // 결과 탭 카운트 업데이트
  set('tab-cnt-all', total.toLocaleString());
  set('tab-pct-all', '100%');
  [['CRN','crn'],['Refurbish','refurbish'],['Auction','auction'],
   ['Recycle','recycle'],['Excluded','excluded'],['Unclassified','unclassified']
  ].forEach(([key, id]) => {
    const cnt = key === 'Unclassified' ? unclTotal : counts[key];
    set(`tab-cnt-${id}`, cnt.toLocaleString());
    set(`tab-pct-${id}`, total ? (cnt/total*100).toFixed(1)+'%' : '—');
  });

  renderProgressBars(counts, total);
  renderCharts(counts, recs, total);
  renderModelTable(recs);
  applyFilters();
}

// ============================================================
// PROGRESS BARS
// ============================================================
function renderProgressBars(counts, total) {
  const items = [
    ['CRN', 'crn', counts.CRN],
    ['Refurbish', 'refurbish', counts.Refurbish],
    ['Auction', 'auction', counts.Auction],
    ['Recycle', 'recycle', counts.Recycle],
    ['Excluded', 'excluded', counts.Excluded],
    ['Unclassified', 'unclassified', (counts.Unclassified||0)+(counts.ERROR||0)],
  ];
  const container = document.getElementById('pbar-container');
  container.innerHTML = items.map(([label, cls, val]) => {
    const pct = total ? Math.max((val/total)*100, val>0?0.5:0) : 0;
    const pctLabel = total ? (val/total*100).toFixed(1)+'%' : '0%';
    return `<div class="pbar-row">
      <div class="pbar-label" style="color:var(--${cls})">${label}</div>
      <div class="pbar-track">
        <div class="pbar-fill pbar-${cls}" style="width:${pct}%">${pct>8?pctLabel:''}</div>
      </div>
      <div class="pbar-val">${val.toLocaleString()}</div>
    </div>`;
  }).join('');
}

// ============================================================
// CHARTS
// ============================================================
const COLORS = {
  CRN:'#22c55e', Refurbish:'#3b82f6', Auction:'#f59e0b',
  Recycle:'#ef4444', Excluded:'#a855f7', Unclassified:'#64748b'
};
const COLORS_BG = {
  CRN:'rgba(34,197,94,.7)', Refurbish:'rgba(59,130,246,.7)', Auction:'rgba(245,158,11,.7)',
  Recycle:'rgba(239,68,68,.7)', Excluded:'rgba(168,85,247,.7)', Unclassified:'rgba(100,116,139,.7)'
};

Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = '#2e3248';

function renderCharts(counts, recs, total) {
  const labels = ['CRN','Refurbish','Auction','Recycle','Excluded','Unclassified'];
  const data = labels.map(l => counts[l]||0);
  const bgColors = labels.map(l => COLORS_BG[l]);
  const borderColors = labels.map(l => COLORS[l]);

  const tooltipLabel = ctx => {
    const v = ctx.parsed || ctx.raw;
    const pct = total ? (v/total*100).toFixed(2) : 0;
    return `${ctx.label}: ${v.toLocaleString()} (${pct}%)`;
  };

  // Pie
  destroyChart('pie');
  state.charts.pie = new Chart(document.getElementById('pie-chart'), {
    type:'pie',
    data:{ labels, datasets:[{ data, backgroundColor:bgColors, borderColor:borderColors, borderWidth:1.5 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ padding:16, font:{size:11} } }, tooltip:{ callbacks:{ label:tooltipLabel } } }
    }
  });

  // Doughnut
  destroyChart('doughnut');
  state.charts.doughnut = new Chart(document.getElementById('doughnut-chart'), {
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor:bgColors, borderColor:borderColors, borderWidth:1.5 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ padding:16, font:{size:11} } }, tooltip:{ callbacks:{ label:tooltipLabel } } }
    }
  });

  // Bar by model (top 10)
  const modelMap = {};
  for (const r of recs) {
    const m = r.marketName || '(N/A)';
    if (!modelMap[m]) modelMap[m] = 0;
    modelMap[m]++;
  }
  const topModels = Object.entries(modelMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
  destroyChart('bar');
  state.charts.bar = new Chart(document.getElementById('bar-chart'), {
    type:'bar',
    data:{
      labels: topModels.map(([k])=>k.replace('Galaxy ','').substring(0,18)),
      datasets:[{ label:'Count', data:topModels.map(([,v])=>v), backgroundColor:'rgba(99,102,241,.7)', borderColor:'#6366f1', borderWidth:1 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ x:{ ticks:{ font:{size:10}, maxRotation:40 } }, y:{ beginAtZero:true } }
    }
  });

  // Grade distribution
  const gradeMap = {};
  for (const r of recs) {
    const g = r.grade || '(N/A)';
    gradeMap[g] = (gradeMap[g]||0) + 1;
  }
  const gradeOrder = ['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-','E','(N/A)'];
  const gradeSorted = gradeOrder.filter(g => gradeMap[g]).map(g => [g, gradeMap[g]]);
  destroyChart('grade');
  state.charts.grade = new Chart(document.getElementById('grade-chart'), {
    type:'bar',
    data:{
      labels: gradeSorted.map(([k])=>k),
      datasets:[{ label:'Count', data:gradeSorted.map(([,v])=>v), backgroundColor:'rgba(245,158,11,.7)', borderColor:'#f59e0b', borderWidth:1 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ x:{ ticks:{ font:{size:11} } }, y:{ beginAtZero:true } }
    }
  });
}

function destroyChart(key) {
  if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; }
}

// ============================================================
// MODEL TABLE
// ============================================================
function renderModelTable(recs) {
  const keys = ['CRN','Refurbish','Auction','Recycle','Excluded','Unclassified'];
  const map = {};
  for (const r of recs) {
    const m = r.marketName || '(N/A)';
    if (!map[m]) map[m] = { CRN:0, Refurbish:0, Auction:0, Recycle:0, Excluded:0, Unclassified:0 };
    const k = keys.includes(r.allocationResult) ? r.allocationResult : 'Unclassified';
    map[m][k]++;
  }
  const sorted = Object.entries(map).sort((a,b) => {
    const ta = Object.values(a[1]).reduce((x,y)=>x+y,0);
    const tb = Object.values(b[1]).reduce((x,y)=>x+y,0);
    return tb - ta;
  }).slice(0,20);

  const tbody = document.getElementById('model-table-body');
  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="icon">📱</div><p>No data available.</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = sorted.map(([model, c]) => {
    const total = Object.values(c).reduce((a,b)=>a+b,0);
    return `<tr>
      <td><strong>${esc(model)}</strong></td>
      <td style="color:var(--crn)">${c.CRN.toLocaleString()}</td>
      <td style="color:var(--refurbish)">${c.Refurbish.toLocaleString()}</td>
      <td style="color:var(--auction)">${c.Auction.toLocaleString()}</td>
      <td style="color:var(--recycle)">${c.Recycle.toLocaleString()}</td>
      <td style="color:var(--excluded)">${c.Excluded.toLocaleString()}</td>
      <td style="color:var(--unclassified)">${c.Unclassified.toLocaleString()}</td>
      <td><strong>${total.toLocaleString()}</strong></td>
    </tr>`;
  }).join('');
}

// ============================================================
// FILTER & SEARCH
// ============================================================
function setTabFilter(result) {
  state.tabFilter = result;
  // 탭 active 상태 업데이트
  document.querySelectorAll('.result-tab').forEach(t => t.classList.remove('active'));
  const tabId = result ? `tab-${result.toLowerCase()}` : 'tab-all';
  const activeTab = document.getElementById(tabId);
  if (activeTab) activeTab.classList.add('active');
  // 카드 연동
  document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-filter'));
  if (result) {
    const card = document.querySelector(`.card-${result.toLowerCase()}`);
    if (card) card.classList.add('active-filter');
  }
  state.page = 1;
  applyFilters();
}

function applyFilters() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const tabFilter = state.tabFilter || '';
  const filterGrade = document.getElementById('filter-grade').value;
  const filterB2B = document.getElementById('filter-b2b').value;
  const filterType = document.getElementById('filter-type').value;

  state.filtered = state.processed.filter(r => {
    if (search && !(`${r.imei} ${r.marketName} ${r.model}`).toLowerCase().includes(search)) return false;
    if (tabFilter) {
      if (tabFilter === 'Unclassified' && r.allocationResult !== 'Unclassified' && r.allocationResult !== 'ERROR') return false;
      else if (tabFilter !== 'Unclassified' && r.allocationResult !== tabFilter) return false;
    }
    if (filterGrade && r.grade !== filterGrade) return false;
    if (filterB2B && String(r.b2bApp).toUpperCase() !== filterB2B) return false;
    if (filterType && r.modelType !== filterType) return false;
    return true;
  });

  state.page = 1;
  document.getElementById('result-count').textContent = `${state.filtered.length.toLocaleString()} records`;
  renderTable();
}

function applyCardFilter(result) {
  setTabFilter(result);
}

function clearFilters() {
  document.getElementById('search-input').value = '';
  document.getElementById('filter-grade').value = '';
  document.getElementById('filter-b2b').value = '';
  document.getElementById('filter-type').value = '';
  setTabFilter('');
}

// ============================================================
// SORT
// ============================================================
function sortBy(key) {
  if (state.sortKey === key) state.sortDir *= -1;
  else { state.sortKey = key; state.sortDir = 1; }

  // Reset all sort icons
  document.querySelectorAll('.sort-icon').forEach(el => el.textContent = '↕');
  const el = document.getElementById(`sort-${key}`);
  if (el) el.textContent = state.sortDir === 1 ? '↑' : '↓';

  state.filtered.sort((a, b) => {
    const av = a[key] !== undefined ? a[key] : '';
    const bv = b[key] !== undefined ? b[key] : '';
    if (typeof av === 'number') return (av - bv) * state.sortDir;
    return String(av).localeCompare(String(bv)) * state.sortDir;
  });
  state.page = 1;
  renderTable();
}

// ============================================================
// TABLE RENDER
// ============================================================
function renderTable() {
  const ps = state.pageSize;
  const page = state.page;
  const filtered = state.filtered;
  const total = filtered.length;
  const start = (page-1)*ps;
  const end = Math.min(start+ps, total);
  const slice = filtered.slice(start, end);

  const tbody = document.getElementById('table-body-rows');

  if (!total) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="icon">🔍</div><p>No data matching the filter criteria.</p></div></td></tr>';
    document.getElementById('page-info').textContent = '0 records';
    document.getElementById('page-btns').innerHTML = '';
    return;
  }

  tbody.innerHTML = slice.map((r, i) => {
    const badgeCls = 'badge-' + (r.allocationResult||'').toLowerCase().replace(/\s/g,'');
    const badge = `<span class="badge ${badgeCls}">${esc(r.allocationResult)}</span>`;
    const reasonShort = r.reason.length > 60 ? r.reason.substring(0,57)+'…' : r.reason;
    const rowId = `row-${start+i}`;
    const detId = `det-${start+i}`;
    return `<tr id="${rowId}" onclick="toggleRow('${rowId}','${detId}',${start+i})" style="cursor:pointer">
      <td style="color:var(--text3)">${r.idx}</td>
      <td>${badge}</td>
      <td style="font-family:monospace;font-size:.82rem">${esc(r.imei)}</td>
      <td>${esc(r.marketName)}</td>
      <td style="color:var(--text2);font-size:.82rem">${esc(r.model)}</td>
      <td><strong>${esc(r.grade)}</strong></td>
      <td style="color:${r.b2bApp==='Y'?'var(--excluded)':'var(--text2)'}">${esc(r.b2bApp)}</td>
      <td style="color:var(--text2)">${esc(r.modelType)}</td>
      <td style="color:var(--text2);max-width:260px;overflow:hidden;text-overflow:ellipsis" title="${esc(r.reason)}">${esc(reasonShort)}</td>
    </tr>
    <tr class="row-detail" id="${detId}">
      <td colspan="9">
        <div class="detail-inner">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">
            <div><strong>IMEI</strong><br>${esc(r.imei)}</div>
            <div><strong>Market Name</strong><br>${esc(r.marketName)}</div>
            <div><strong>Model</strong><br>${esc(r.model)||'—'}</div>
            <div><strong>Grade (Original)</strong><br>${esc(r.grade)}</div>
            <div><strong>Grade (Normalized)</strong><br>${esc(r.normalizedGrade)||'—'}</div>
            <div><strong>B2B App</strong><br>${esc(r.b2bApp)}</div>
            <div><strong>Model Type</strong><br>${esc(r.modelType)}</div>
            <div><strong>Series</strong><br>${esc(r.series)} ${r.seriesNum||''}</div>
            ${r.color?`<div><strong>Color</strong><br>${esc(r.color)}</div>`:''}
            ${r.storage?`<div><strong>Storage</strong><br>${esc(r.storage)}</div>`:''}
            ${r.batteryHealth?`<div><strong>Battery Health</strong><br>${esc(r.batteryHealth)}</div>`:''}
          </div>
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
            <strong>Result:</strong> <span class="badge badge-${(r.allocationResult||'').toLowerCase()}">${esc(r.allocationResult)}</span>
            &nbsp;&nbsp;<strong>Reason:</strong> <span style="color:var(--text2)">${esc(r.reason)}</span>
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('page-info').textContent = `${start+1}–${end} / ${total.toLocaleString()} records`;
  renderPagination(total, ps, page);
}

function toggleRow(rowId, detId, idx) {
  const row = document.getElementById(rowId);
  const det = document.getElementById(detId);
  if (!det) return;
  const open = det.classList.toggle('open');
  if (open) row.classList.add('expanded');
  else row.classList.remove('expanded');
}

function renderPagination(total, ps, cur) {
  const pages = Math.ceil(total/ps);
  const container = document.getElementById('page-btns');
  if (pages <= 1) { container.innerHTML = ''; return; }

  let html = `<button class="page-btn" onclick="goPage(${cur-1})" ${cur===1?'disabled':''}>‹</button>`;

  const showPages = [];
  showPages.push(1);
  if (cur > 3) showPages.push('…');
  for (let p = Math.max(2, cur-1); p <= Math.min(pages-1, cur+1); p++) showPages.push(p);
  if (cur < pages-2) showPages.push('…');
  if (pages > 1) showPages.push(pages);

  for (const p of showPages) {
    if (p === '…') html += `<span style="padding:0 4px;color:var(--text3)">…</span>`;
    else html += `<button class="page-btn ${p===cur?'active':''}" onclick="goPage(${p})">${p}</button>`;
  }
  html += `<button class="page-btn" onclick="goPage(${cur+1})" ${cur===pages?'disabled':''}>›</button>`;
  container.innerHTML = html;
}

function goPage(p) {
  const pages = Math.ceil(state.filtered.length / state.pageSize);
  if (p < 1 || p > pages) return;
  state.page = p;
  renderTable();
  document.getElementById('table-section').scrollIntoView({ behavior:'smooth', block:'start' });
}

function changePageSize() {
  state.pageSize = parseInt(document.getElementById('page-size').value);
  state.page = 1;
  renderTable();
}

// ============================================================
// LOG
// ============================================================
function log(msg, type='info') {
  const panel = document.getElementById('log-panel');
  const ts = new Date().toLocaleTimeString('en-US');
  const cls = type === 'error' ? 'log-error' : type === 'warn' ? 'log-warn' : type === 'success' ? 'log-success' : 'log-info';
  const line = document.createElement('div');
  line.innerHTML = `<span class="${cls}">[${ts}] ${esc(msg)}</span>`;
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
}

function clearLog() {
  document.getElementById('log-panel').innerHTML = '';
}

// ============================================================
// EXPORT
// ============================================================
function exportExcel() {
  if (!state.processed.length) return;
  const wb = XLSX.utils.book_new();

  // ── Sheet1: Allocation Results ──
  const resultRows = state.filtered.map(r => ({
    '#': r.idx,
    'Result': r.allocationResult,
    'IMEI': r.imei,
    'Market Name': r.marketName,
    'Model': r.model,
    'Grade': r.grade,
    'Grade (Normalized)': r.normalizedGrade || '',
    'B2B App': r.b2bApp,
    'Type': r.modelType,
    'Series': `${r.series}${r.seriesNum||''}`,
    'Reason': r.reason,
    'Color': r.color || '',
    'Storage': r.storage || '',
    'Battery Health': r.batteryHealth || ''
  }));
  const ws1 = XLSX.utils.json_to_sheet(resultRows);

  ws1['!cols'] = [
    {wch:6}, {wch:14}, {wch:18}, {wch:22}, {wch:12},
    {wch:8}, {wch:10}, {wch:8}, {wch:8}, {wch:8},
    {wch:40}, {wch:10}, {wch:10}, {wch:14}
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Allocation Results');

  // ── Sheet2: Summary ──
  const counts = countResults(state.processed);
  const total = state.processed.length;
  const summaryRows = Object.entries(counts).map(([cat, cnt]) => ({
    'Category': cat,
    'Count': cnt,
    'Ratio(%)': total ? (cnt / total * 100).toFixed(2) : '0.00'
  }));
  summaryRows.push({ 'Category': 'Total', 'Count': total, 'Ratio(%)': '100.00' });
  const ws2 = XLSX.utils.json_to_sheet(summaryRows);
  ws2['!cols'] = [{wch:16}, {wch:10}, {wch:10}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

  const ts = new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');
  XLSX.writeFile(wb, `allocation_result_${ts}.xlsx`);
  log('Excel file has been exported successfully.', 'success');
}

function exportCSV() {
  if (!state.processed.length) return;
  const headers = ['#','IMEI','Market Name','Model','Grade','Grade (Normalized)','B2B App','Type','Series','Result','Reason','Color','Storage','Battery Health'];
  const rows = state.filtered.map(r => [
    r.idx, r.imei, r.marketName, r.model, r.grade, r.normalizedGrade||'',
    r.b2bApp, r.modelType, `${r.series}${r.seriesNum||''}`,
    r.allocationResult, r.reason, r.color||'', r.storage||'', r.batteryHealth||''
  ]);
  const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  download('allocation_result.csv', csv, 'text/csv;charset=utf-8;');
  log('CSV file has been exported successfully.', 'success');
}

function exportJSON() {
  if (!state.processed.length) return;
  const data = {
    exportedAt: new Date().toISOString(),
    total: state.processed.length,
    summary: countResults(state.processed),
    nModels: state.nModels,
    records: state.filtered
  };
  download('allocation_result.json', JSON.stringify(data, null, 2), 'application/json');
  log('JSON file has been exported successfully.', 'success');
}

function download(filename, content, mimeType) {
  const blob = new Blob(['﻿'+content], { type:mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// CLIPBOARD PASTE (Samsung DRM 우회)
// ============================================================
async function pasteFromClipboard() {
  try {
    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch(e) {
      log('Clipboard access denied. Please grant clipboard permission via the lock icon in the browser address bar.', 'error');
      alert('Clipboard permission is required.\n\nPlease click the lock (🔒) icon in the address bar\n→ Site Settings → Clipboard → Allow');
      return;
    }

    if (!text || !text.trim()) {
      log('The clipboard is empty. Please select all content in Excel (Ctrl+A) and copy (Ctrl+C) before proceeding.', 'warn');
      return;
    }

    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      log('Insufficient clipboard data. Please select all content in Excel (Ctrl+A) and copy (Ctrl+C).', 'warn');
      return;
    }

    log(`${lines.length} rows detected from clipboard. Parsing data...`, 'info');

    // Excel 복사는 항상 Tab 구분자
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const rows = lines.map(l => {
      const cols = [];
      let cur = '', inQ = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === delimiter && !inQ) { cols.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      cols.push(cur.trim());
      return cols;
    });

    // 헤더 자동 감지
    const keywords = ['imei','grade','market','model','galaxy'];
    let headerIdx = 0;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const rowStr = rows[i].join(' ').toLowerCase();
      if (keywords.some(k => rowStr.includes(k))) { headerIdx = i; break; }
    }

    const headers = rows[headerIdx].map(h => h.replace(/^"|"$/g, '').trim());
    const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => c.trim()));

    if (dataRows.length === 0) {
      log('No data rows were found. Please ensure the entire sheet is selected in Excel.', 'warn');
      return;
    }

    const records = dataRows.map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (row[i] || '').replace(/^"|"$/g, '').trim(); });
      return obj;
    });

    loadedFile = { name: 'Clipboard paste', type: 'clipboard' };
    document.getElementById('file-label').textContent = `📋 Clipboard — ${records.length} rows`;
    state.rawData = records;

    const preview = Object.entries(records[0]).slice(0,5).map(([k,v])=>`${k}=${v}`).join(' | ');
    log(`Clipboard data parsed successfully: ${records.length} records | Detected headers: [${headers.slice(0,5).join(', ')}]`, 'success');
    log('Data preview: ' + preview, 'info');

    document.getElementById('btn-run').disabled = false;
  } catch(err) {
    log('An error occurred while pasting from clipboard: ' + err.message, 'error');
  }
}

// ============================================================
// RESET
// ============================================================
function resetAll() {
  state.rawData = [];
  state.processed = [];
  state.filtered = [];
  state.tabFilter = '';
  state.page = 1;
  state.nModels = { S:null, A:null, Z:null };
  loadedFile = null;
  // 탭 초기화
  document.querySelectorAll('.result-tab').forEach(t => t.classList.remove('active'));
  const allTab = document.getElementById('tab-all');
  if (allTab) allTab.classList.add('active');
  // 탭 카운트 초기화
  ['all','crn','refurbish','auction','recycle','excluded','unclassified'].forEach(id => {
    const c = document.getElementById(`tab-cnt-${id}`); if(c) c.textContent='—';
    const p = document.getElementById(`tab-pct-${id}`); if(p) p.textContent='—';
  });

  document.getElementById('file-label').textContent = 'No file selected';
  document.getElementById('file-input').value = '';
  document.getElementById('btn-run').disabled = true;
  document.getElementById('btn-export-excel').disabled = true;
  document.getElementById('btn-dl-excel').disabled = true;
  document.getElementById('btn-export-csv').disabled = true;
  document.getElementById('btn-export-json').disabled = true;
  document.getElementById('timestamp').textContent = '—';

  ['cnt-total','cnt-crn','cnt-refurbish','cnt-auction','cnt-recycle','cnt-excluded','cnt-unclassified'].forEach(id => {
    const el = document.getElementById(id); if(el) el.textContent = '—';
  });
  ['pct-crn','pct-refurbish','pct-auction','pct-recycle','pct-excluded','pct-unclassified'].forEach(id => {
    const el = document.getElementById(id); if(el) el.textContent = '—';
  });
  document.getElementById('pct-total').textContent = 'Total';
  document.getElementById('pbar-container').innerHTML = '';
  document.getElementById('table-body-rows').innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="icon">📂</div><p>Upload an Excel file and run Final Confirmation.</p></div></td></tr>';
  document.getElementById('model-table-body').innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="icon">📱</div><p>No data available.</p></div></td></tr>';
  document.getElementById('result-count').textContent = '—';
  document.getElementById('page-info').textContent = '0 records';
  document.getElementById('page-btns').innerHTML = '';
  Object.keys(state.charts).forEach(k => destroyChart(k));
  setProgress(-1);
  clearFilters();
  log('The system has been reset successfully.', 'info');
}

// ============================================================
// SIDEBAR NAVIGATION
// ============================================================
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const topbarH = document.getElementById('topbar')?.offsetHeight || 60;
  const y = el.getBoundingClientRect().top + window.scrollY - topbarH - 12;
  window.scrollTo({ top: y, behavior: 'smooth' });

  // 해당 섹션 테두리 플래시로 도달 확인
  el.classList.remove('section-flash');
  void el.offsetWidth; // reflow로 animation 재시작
  el.classList.add('section-flash');
  el.addEventListener('animationend', () => el.classList.remove('section-flash'), { once: true });

  // 사이드바 active 즉시 업데이트
  document.querySelectorAll('.nav-item').forEach(n => {
    const target = n.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    n.classList.toggle('active', target === id);
  });
}

// 스크롤 시 사이드바 active 항목 자동 갱신
const navSections = ['upload-section','cards-section','filter-section','model-section','charts-section','log-section'];
window.addEventListener('scroll', () => {
  let current = navSections[0];
  for (const id of navSections) {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top < 120) current = id;
  }
  document.querySelectorAll('.nav-item').forEach(n => {
    const target = n.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    n.classList.toggle('active', target === current);
  });
}, { passive:true });

// ============================================================
// UTIL
// ============================================================
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
