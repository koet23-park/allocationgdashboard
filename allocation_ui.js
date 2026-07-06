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
  renderAutoRangeInfo();
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
// EXPORT — EXCEL (Main_Data / CRN / Refurbish / Auction / Recycle /
// Excluded / Summary_Log / Error_Log / Rule — matches the reference
// "allocation_IMEI Validation_*.xlsx" workbook format exactly)
// ============================================================
const XLSX_THIN_BORDER = {
  top: { style: 'thin' }, bottom: { style: 'thin' },
  left: { style: 'thin' }, right: { style: 'thin' }
};

function styleCatHeaderRow(row, aligns) {
  row.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1F2E' } };
    cell.alignment = { horizontal: aligns[colNumber - 1] || 'center', vertical: 'middle' };
    cell.border = XLSX_THIN_BORDER;
  });
}

function styleCatDataRow(row, bgHex, aligns) {
  row.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1A1F2E' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgHex } };
    cell.alignment = { horizontal: aligns[colNumber - 1] || 'left', vertical: 'middle' };
    cell.border = XLSX_THIN_BORDER;
  });
}

function styleCatTotalRow(row, aligns) {
  row.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1A1F2E' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
    cell.alignment = { horizontal: aligns[colNumber - 1] || 'left', vertical: 'middle' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
}

function computeMarketBreakdown(recs) {
  const map = new Map();
  for (const r of recs) {
    const key = r.marketName || '(blank)';
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function buildCategorySheet(wb, category) {
  const recs = state.processed.filter(r => r.allocationResult === category);
  const ws = wb.addWorksheet(category);
  ws.columns = [
    { width: 26 }, { width: 14 }, { width: 10 }, { width: 20 },
    { width: 8 }, { width: 14 }, { width: 13 }, { width: 16 }
  ];

  const total = recs.length;
  const breakdown = computeMarketBreakdown(recs);

  const h1 = ws.addRow(['Market Name', 'Count', 'Ratio(%)']);
  h1.height = 18;
  styleCatHeaderRow(h1, ['left', 'center', 'center']);

  breakdown.forEach(([name, cnt]) => {
    const ratio = total ? (cnt / total * 100).toFixed(1) + '%' : '0.0%';
    const row = ws.addRow([name, cnt, ratio]);
    row.height = 18;
    styleCatDataRow(row, 'F9F9F9', ['left', 'right', 'right']);
  });

  const totalRow = ws.addRow(['Total', total, '100%']);
  totalRow.height = 18;
  styleCatTotalRow(totalRow, ['left', 'right', 'right']);

  const blankRow = ws.addRow([]);
  blankRow.height = 18;

  const detailCols = ['Market Name', 'Model', 'Storage', 'IMEI', 'Grade', 'Battery Health', 'B2B App. Y/N', 'Allocation Result'];
  const h2 = ws.addRow(detailCols);
  h2.height = 18;
  styleCatHeaderRow(h2, detailCols.map(() => 'center'));

  recs.forEach((r, i) => {
    const row = ws.addRow([r.marketName, r.model, r.storage, r.imei, r.grade, r.batteryHealth, r.b2bApp, r.allocationResult]);
    row.height = 18;
    styleCatDataRow(row, i % 2 === 0 ? 'FFFFFF' : 'F9F9F9', ['left', 'left', 'left', 'left', 'left', 'left', 'left', 'center']);
    row.getCell(4).numFmt = '@'; // IMEI as text (avoid scientific notation)
    const resultCell = row.getCell(8);
    resultCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    resultCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E6B42' } };
  });
}

function buildMainDataSheet(wb, colMap, rawHeaders) {
  const ws = wb.addWorksheet('Main_Data');
  const imeiKey = colMap.imei;

  // Allocation Result는 맨 마지막 컬럼으로 출력한다 (Reason도 그 앞에 위치).
  const headers = [...rawHeaders, 'Reason', 'Allocation Result'];

  ws.addRow(headers);

  state.processed.forEach(rec => {
    const raw = state.rawData[rec.idx - 1] || {};
    const rowVals = headers.map(h => {
      if (h === 'Allocation Result') return rec.allocationResult;
      if (h === 'Reason') return rec.reason;
      const v = raw[h];
      return (v === undefined || v === null) ? '' : String(v);
    });
    ws.addRow(rowVals);
  });

  if (imeiKey) {
    const imeiColIdx = headers.indexOf(imeiKey) + 1;
    if (imeiColIdx > 0) {
      ws.getColumn(imeiColIdx).eachCell({ includeEmpty: false }, cell => { cell.numFmt = '@'; });
    }
  }

  // Allocation Result 컬럼 볼드 처리 (Python 결과 엑셀과 동일한 스타일 —
  // 헤더는 검정 배경에 흰 굵은 글씨, 데이터는 굵은 글씨).
  // lastIndexOf를 쓰는 이유: 원본 데이터에 'Allocation Result' 컬럼이 이미
  // 있는 경우(예: Python 결과 파일을 다시 업로드) 방금 맨 끝에 추가한
  // 컬럼이 아니라 그 이전 컬럼을 잘못 집을 수 있기 때문.
  const allocColIdx = headers.lastIndexOf('Allocation Result') + 1;
  if (allocColIdx > 0) {
    const headerCell = ws.getRow(1).getCell(allocColIdx);
    headerCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    for (let r = 2; r <= ws.rowCount; r++) {
      ws.getRow(r).getCell(allocColIdx).font = { bold: true };
    }
  }
}

function buildSummaryLogSheet(wb) {
  const ws = wb.addWorksheet('Summary_Log');
  const counts = countResults(state.processed);
  const totalRows = state.rawData.length;
  const errorRows = counts.ERROR || 0;
  const processedRows = totalRows - errorRows;

  ws.addRow(['Metric', 'Count']);
  ws.addRow(['Total Rows', totalRows]);
  ws.addRow(['Processed Rows', processedRows]);
  ws.addRow(['Error Rows', errorRows]);
  ws.addRow(['CRN Count', counts.CRN]);
  ws.addRow(['Refurbish Count', counts.Refurbish]);
  ws.addRow(['Auction Count', counts.Auction]);
  ws.addRow(['Recycle Count', counts.Recycle]);
  ws.addRow(['Excluded Count', counts.Excluded]);
  ws.addRow(['Unclassified Count', counts.Unclassified]);
}

function buildErrorLogSheet(wb, colMap) {
  const ws = wb.addWorksheet('Error_Log');
  ws.addRow(['IMEI', 'Issue Type', 'Details', 'Allocation Result']);

  state.processed.forEach(rec => {
    if (rec.allocationResult !== 'ERROR' && rec.allocationResult !== 'Unclassified') return;
    const raw = state.rawData[rec.idx - 1] || {};
    const imeiVal = colMap.imei ? String(raw[colMap.imei] ?? rec.imei) : rec.imei;
    const issueType = rec.allocationResult === 'ERROR' ? 'IMEI Validation Error' : 'Unclassified';
    ws.addRow([imeiVal, issueType, rec.reason, rec.allocationResult]);
  });
}

const RULE_SHEET_HEADER = ['규칙 번호', '분류', '조건 항목', '현재 값', '변경 방법'];

// Rule 탭 내용을 이 함수가 매번 실행 시점의 state.ruleConfig / state.nModels /
// state.effectiveRuleTables에서 직접 생성한다 — 예전에는 이 시트가 고정 텍스트라
// 실제 판정 로직(테이블 기반 규칙 + N-Model 자동 계산)이 바뀌어도 시트 내용이
// 따라가지 못하는 문제가 있었다. 이제는 항상 "지금 실제로 적용된 규칙"을 그대로
// 보여준다.
function formatRuleRow(row) {
  const grades = (row.grades || []).join(', ') || '(no grades)';
  return `${row.prefix} → Grade: ${grades}`;
}

function buildRuleSheetRows() {
  const nS = state.nModels && state.nModels.S;
  const cfg = state.ruleConfig || DEFAULT_RULE_CONFIG;
  const rows = [];
  const blank = () => rows.push({ type: 'blank', vals: [null, null, null, null, null] });
  const section = title => rows.push({ type: 'section', vals: [null, title, null, null, null] });
  const normal = vals => rows.push({ type: 'normal', vals });

  rows.push({ type: 'header', vals: RULE_SHEET_HEADER });
  section('【 현재 적용 규칙 (실행 시점 기준) 】');
  blank();
  normal(RULE_SHEET_HEADER);
  normal(['Rule 0', 'Excluded', 'B2B App. Y/N = Y인 경우 모든 배분 제외', 'Y → Excluded', 'Rule Management 탭에는 없음 (엔진 고정 로직)']);
  blank();

  section('【 CRN 규칙 】');
  if (nS) {
    const gens = BAR_S_CRN_OFFSETS.map(o => nS + o).filter(g => g > 0);
    normal(['Rule 1-A', 'CRN / Bar (Galaxy S)', '대상 모델 세대 (자동 계산)', `N-1~N-3, 현재 N=S${nS} → ${gens.map(g => 'S'+g).join(', ')}`, '자동 계산 값 — 오프셋을 바꾸려면 allocation_engine.js의 BAR_S_CRN_OFFSETS 상수 수정 필요']);
  } else {
    normal(['Rule 1-A', 'CRN / Bar (Galaxy S)', '대상 모델 세대 (자동 계산)', 'N/A — 아직 실행 전 (Run Final Confirmation 후 표시됨)', '-']);
  }
  normal(['Rule 1-B', 'CRN / Bar (Galaxy S)', '대상 등급 (자동 계산)', BAR_S_CRN_GRADES.join(', '), 'allocation_engine.js의 BAR_S_CRN_GRADES 상수 수정 필요']);
  (cfg.crn || []).forEach((row, i) => {
    normal([`Rule 1-C-${i+1}`, 'CRN / 수동 예외 (Fold·Flip 등)', 'Model Name Prefix', formatRuleRow(row), 'Rule Management 탭 → CRN Eligible Models 표에서 직접 수정']);
  });
  if (!(cfg.crn || []).length) normal(['Rule 1-C', 'CRN / 수동 예외', '-', '(등록된 예외 모델 없음)', 'Rule Management 탭 → CRN Eligible Models 표에서 추가']);
  blank();

  section('【 Refurbish 규칙 】');
  if (nS) {
    const gens = BAR_S_REFURBISH_OFFSETS.map(o => nS + o).filter(g => g > 0);
    normal(['Rule 2-A', 'Refurbish / Bar (Galaxy S)', '대상 모델 세대 (자동 계산)', `N~N-5, 현재 N=S${nS} → ${gens.map(g => 'S'+g).join(', ')}`, '자동 계산 값 — 오프셋을 바꾸려면 allocation_engine.js의 BAR_S_REFURBISH_OFFSETS 상수 수정 필요']);
  } else {
    normal(['Rule 2-A', 'Refurbish / Bar (Galaxy S)', '대상 모델 세대 (자동 계산)', 'N/A — 아직 실행 전 (Run Final Confirmation 후 표시됨)', '-']);
  }
  normal(['Rule 2-B', 'Refurbish / Bar (Galaxy S)', '대상 등급 (자동 계산)', BAR_S_REFURBISH_GRADES.join(', '), 'allocation_engine.js의 BAR_S_REFURBISH_GRADES 상수 수정 필요']);
  (cfg.refurbish || []).forEach((row, i) => {
    normal([`Rule 2-C-${i+1}`, 'Refurbish / 수동 예외 (Note20·Fold·Flip 등)', 'Model Name Prefix', formatRuleRow(row), 'Rule Management 탭 → Refurbish Eligible Models 표에서 직접 수정']);
  });
  if (!(cfg.refurbish || []).length) normal(['Rule 2-C', 'Refurbish / 수동 예외', '-', '(등록된 예외 모델 없음)', 'Rule Management 탭 → Refurbish Eligible Models 표에서 추가']);
  blank();

  section('【 Recycle 규칙 】');
  normal(['Rule 3-A', 'Recycle / 기본 규칙 (모델 무관)', '대상 등급', 'E 등급 (CRN·Refurbish 미해당 시, 모델 상관없이 적용)', 'allocation_engine.js의 checkRecycle() 함수 내 normalizedGrade===\'E\' 조건 수정 필요']);
  (cfg.recycle || []).forEach((row, i) => {
    normal([`Rule 3-B-${i+1}`, 'Recycle / 추가 예외 (특정 모델에 E 외 등급도 허용)', 'Model Name Prefix', formatRuleRow(row), 'Rule Management 탭 → Recycle Eligible Models 표에서 직접 수정']);
  });
  if (!(cfg.recycle || []).length) normal(['Rule 3-B', 'Recycle / 추가 예외', '-', '(등록된 예외 모델 없음 — E등급 기본 규칙만 적용됨)', 'Rule Management 탭 → Recycle Eligible Models 표에서 추가']);
  blank();

  section('【 Auction 규칙 】');
  normal(['Rule 4', 'Auction', '조건', '위 Rule 0~3에 해당하지 않는 모든 항목', '별도 변경 불필요 — 다른 규칙 변경 시 자동으로 범위 조정됨']);
  blank();

  section('【 N-Model(최신 세대) 자동 감지 기준 】');
  normal(['참고 1', 'N-Model 산출', '방식', nS ? `현재 업로드 파일 기준 N = S${nS} (Market Name의 Galaxy S 세대 중 최댓값)` : '아직 실행 전 — 업로드 파일의 Market Name에서 Galaxy S 세대 중 최댓값을 자동 감지', 'Rule Management 탭이 아닌, 업로드하는 파일 데이터 자체가 기준']);
  normal(['참고 2', 'Bar 타입 판별', '기준', "Market Name에 'Galaxy S' 또는 'Galaxy A' 포함", 'allocation_engine.js의 determineModelType() 수정 필요']);
  normal(['참고 3', 'FF 타입 판별', '기준', "Market Name에 'Fold', 'Flip', 'Z' 포함", 'allocation_engine.js의 determineModelType() 수정 필요']);
  blank();

  section('【 등급(Grade) 정규화 기준 】');
  normal(['참고 4', '등급 정규화', '매핑 테이블', 'A+/A/A- → A,  B+/B/B- → B,  C+/C/C- → C,  D+/D/D- → D,  E → E', 'allocation_engine.js의 GRADE_MAP 상수 수정 필요']);
  blank();

  section('【 배분 판정 우선순위 】');
  normal(['참고 5', '판정 순서', '1순위 → 최종', '① Excluded(B2B=Y)  ②  CRN  ③ Refurbish  ④ Recycle  ⑤ Auction', 'allocation_engine.js의 applyRules() 함수 내 판정 순서 수정 필요']);

  return rows;
}

function buildRuleSheet(wb) {
  const ws = wb.addWorksheet('Rule');
  ws.columns = [{ width: 14 }, { width: 30 }, { width: 30 }, { width: 60 }, { width: 60 }];

  const ruleRows = buildRuleSheetRows();
  let toggle = false; // first non-special row = F5F5F5, then alternates
  ruleRows.forEach((def, i) => {
    const row = ws.addRow(def.vals);
    if (i > 0) row.height = 42;

    // use getCell (not eachCell) so columns with a null value are styled too
    const cells = [1, 2, 3, 4, 5].map(c => row.getCell(c));

    if (def.type === 'header') {
      cells.forEach(c => {
        c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F5B93' } };
        c.alignment = { vertical: 'top', wrapText: true };
        c.border = XLSX_THIN_BORDER;
      });
    } else if (def.type === 'section') {
      cells.forEach(c => {
        c.font = { bold: true, size: 10, color: { argb: 'FF1A237E' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5CAE9' } };
        c.alignment = { vertical: 'top', wrapText: true };
        c.border = XLSX_THIN_BORDER;
      });
    } else {
      const bg = toggle ? 'FFFFFF' : 'F5F5F5';
      toggle = !toggle;
      cells.forEach(c => {
        c.font = { size: 9 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };
        c.alignment = { vertical: 'top', wrapText: true };
        c.border = XLSX_THIN_BORDER;
      });
    }
  });
}

async function exportExcel() {
  if (!state.processed.length) return;
  try {
    log('Building Excel workbook...', 'info');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Allocation Confirm Dashboard';
    wb.created = new Date();

    const colMap = detectColumns(state.rawData) || {};
    const rawHeaders = state.rawData.length ? Object.keys(state.rawData[0]) : [];

    buildMainDataSheet(wb, colMap, rawHeaders);
    ['CRN', 'Refurbish', 'Auction', 'Recycle', 'Excluded'].forEach(cat => buildCategorySheet(wb, cat));
    buildSummaryLogSheet(wb);
    buildErrorLogSheet(wb, colMap);
    buildRuleSheet(wb);

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const baseName = (loadedFile && loadedFile.name) ? loadedFile.name.replace(/\.[^.]+$/, '') : 'result';
    const a = document.createElement('a');
    a.href = url; a.download = `allocation_${baseName}.xlsx`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    log('Excel file has been exported successfully.', 'success');
  } catch (err) {
    log('Excel export failed: ' + err.message, 'error');
    console.error(err);
  }
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
// PAGE SWITCHING (Dashboard vs. Rules)
// ============================================================
function switchPage(page) {
  document.getElementById('page-dashboard').classList.toggle('active', page === 'dashboard');
  document.getElementById('page-rules').classList.toggle('active', page === 'rules');
  document.getElementById('page-tab-dashboard').classList.toggle('active', page === 'dashboard');
  document.getElementById('page-tab-rules').classList.toggle('active', page === 'rules');
  document.getElementById('dashboard-nav').style.display = page === 'dashboard' ? '' : 'none';
  window.scrollTo({ top: 0 });
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

// ============================================================
// RULE MANAGEMENT
// CRN / Refurbish / Recycle 판정에 쓰이는 모델별 등급 허용 테이블을
// 직접 편집하고 저장(localStorage)한다. 저장 후 다음 "Run Final
// Confirmation"부터 즉시 새 규칙이 적용된다 (allocation_engine.js의
// checkCRN/checkRefurbish/checkRecycle이 state.ruleConfig를 실시간 참조).
// ============================================================
const RULE_CATEGORIES = [
  { key: 'crn', color: 'crn' },
  { key: 'refurbish', color: 'refurbish' },
  { key: 'recycle', color: 'recycle' },
];

function renderRuleTables() {
  RULE_CATEGORIES.forEach(cat => renderRuleTable(cat));
  renderAutoRangeInfo();
}

// CRN/Refurbish의 Bar(Galaxy S) 세대 범위는 더 이상 이 표에서 수동으로
// 관리하지 않는다 — 업로드된 파일에서 감지된 N-Model 기준 자동 계산이며,
// 그 결과를 안내 배너로 보여준다. 아직 파일을 실행하지 않았다면 N을 알 수
// 없으므로 안내 문구만 표시한다.
function renderAutoRangeInfo() {
  const nS = state.nModels && state.nModels.S;
  const crnEl = document.getElementById('rule-auto-range-crn');
  const rbEl = document.getElementById('rule-auto-range-refurbish');
  if (!crnEl || !rbEl) return;

  if (!nS) {
    const msg = 'ℹ️ Bar (Galaxy S) generation range is auto-detected from the uploaded file\'s highest S-series number (N) — run "Run Final Confirmation" once to see the computed range. The table below only lists manual exceptions (Fold/Flip/Note models).';
    crnEl.textContent = msg;
    rbEl.textContent = msg;
    return;
  }

  const crnGens = BAR_S_CRN_OFFSETS.map(o => nS + o).filter(g => g > 0);
  const rbGens = BAR_S_REFURBISH_OFFSETS.map(o => nS + o).filter(g => g > 0);
  crnEl.textContent = `ℹ️ Auto-detected N = S${nS}. Bar (Galaxy S) CRN range = N-1~N-3 → ${crnGens.map(g => 'S'+g).join(', ')}. The table below only lists manual exceptions (Fold/Flip models).`;
  rbEl.textContent = `ℹ️ Auto-detected N = S${nS}. Bar (Galaxy S) Refurbish range = N~N-5 → ${rbGens.map(g => 'S'+g).join(', ')}. The table below only lists manual exceptions (Note20/Fold/Flip models).`;
}

function renderRuleTable(cat) {
  const body = document.getElementById(`rule-tbody-${cat.key}`);
  if (!body) return;
  const rows = (state.ruleConfig && state.ruleConfig[cat.key]) || [];

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="3"><div class="empty-state" style="padding:24px 0;"><p>No models registered yet. Click "+ Add Row" to get started.</p></div></td></tr>`;
    return;
  }

  body.innerHTML = rows.map((row, i) => `
    <tr>
      <td>
        <input type="text" class="rule-prefix-input" value="${esc(row.prefix)}"
               placeholder="e.g., GALAXY S25 ULTRA"
               oninput="updateRulePrefix('${cat.key}', ${i}, this.value)">
      </td>
      <td>
        <div class="grade-toggle-group">
          ${GRADE_TOGGLES.map(g => `
            <button type="button"
                    class="grade-toggle-btn cat-${cat.color}${(row.grades || []).includes(g) ? ' active' : ''}"
                    onclick="toggleRuleGrade('${cat.key}', ${i}, '${g}')">${g}</button>
          `).join('')}
        </div>
      </td>
      <td><button type="button" class="btn-rule-delete" title="Delete row" onclick="removeRuleRow('${cat.key}', ${i})">✕</button></td>
    </tr>
  `).join('');
}

function addRuleRow(catKey) {
  if (!state.ruleConfig[catKey]) state.ruleConfig[catKey] = [];
  state.ruleConfig[catKey].push({ prefix: '', grades: [] });
  renderRuleTable(RULE_CATEGORIES.find(c => c.key === catKey));
}

function removeRuleRow(catKey, idx) {
  state.ruleConfig[catKey].splice(idx, 1);
  renderRuleTable(RULE_CATEGORIES.find(c => c.key === catKey));
}

function updateRulePrefix(catKey, idx, value) {
  const row = state.ruleConfig[catKey][idx];
  if (row) row.prefix = value;
}

function toggleRuleGrade(catKey, idx, grade) {
  const row = state.ruleConfig[catKey][idx];
  if (!row) return;
  if (!row.grades) row.grades = [];
  const pos = row.grades.indexOf(grade);
  if (pos >= 0) row.grades.splice(pos, 1);
  else row.grades.push(grade);
  renderRuleTable(RULE_CATEGORIES.find(c => c.key === catKey));
}

function saveRules() {
  saveRuleConfigToStorage(state.ruleConfig);
  log('Rule configuration saved. It will apply on the next "Run Final Confirmation".', 'success');
  const btn = document.getElementById('btn-save-rules');
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ Saved';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }
}

function exportRulesJSON() {
  download('allocation_rules.json', JSON.stringify(state.ruleConfig, null, 2), 'application/json');
  log('Rule configuration exported as JSON.', 'success');
}

function importRulesJSON(fileInput) {
  const file = fileInput && fileInput.files && fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || !Array.isArray(parsed.crn) || !Array.isArray(parsed.refurbish) || !Array.isArray(parsed.recycle)) {
        throw new Error('crn/refurbish/recycle arrays are required.');
      }
      state.ruleConfig = parsed;
      renderRuleTables();
      log('Rule configuration imported from JSON. Click "Save Rules" to persist it.', 'success');
    } catch (err) {
      log('Failed to import rule file: ' + err.message, 'error');
    }
    fileInput.value = '';
  };
  reader.readAsText(file, 'utf-8');
}

function resetRulesToDefault() {
  if (!confirm('This will reset all rules to their default values. Unsaved changes will be lost. Continue?')) return;
  state.ruleConfig = cloneDefaultRuleConfig();
  renderRuleTables();
  log('Rule configuration reset to default (not yet saved — click "Save Rules" to persist).', 'warn');
}

renderRuleTables();
