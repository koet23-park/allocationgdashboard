// ============================================================
// STATE
// ============================================================
const state = {
  rawData: [],
  processed: [],
  filtered: [],
  tabFilter: '',
  sortKey: 'idx',
  sortDir: 1,
  page: 1,
  pageSize: 50,
  activeFilter: '',
  charts: {},
  nModels: { S:null, A:null, Z:null },
  ruleConfig: null, // set below via loadRuleConfig()
  effectiveRuleTables: null, // set by buildEffectiveRuleTables() — manual rows + auto-generated Bar/S rows
};

// ============================================================
// RULE MANAGEMENT — 모델별 등급 허용 테이블 (CRN / Refurbish / Recycle)
// 대시보드의 "규칙 관리" 탭에서 직접 편집 → 저장 → 다음 Run Final
// Confirmation부터 즉시 반영된다. (localStorage에 영속화)
//
// Bar/S 시리즈(Galaxy S)는 여기 표에 고정 항목으로 넣지 않는다 — 매번 업로드된
// 데이터에서 감지되는 N-Model을 기준으로 generateBarSeriesRows()가 자동
// 계산한다 (v2에서 변경: 이전에는 S23~S25 등을 하드코딩해서 신규 세대
// 출시 때마다(예: S26) 수동으로 표를 고쳐야 했고, 고치지 않으면 최신 세대가
// 누락되는 문제가 있었다). Z(Fold/Flip)·Note20 등 예외 모델만 수동 표에 남는다.
// ============================================================
const RULE_STORAGE_KEY = 'allocationRuleConfig_v2';
const GRADE_TOGGLES = ['A+','A','B+','B','C+','C','D+','D','E'];

function cloneDefaultRuleConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_RULE_CONFIG));
}

const DEFAULT_RULE_CONFIG = {
  crn: [
    'GALAXY Z FLIP5','GALAXY Z FLIP6','GALAXY Z FLIP7',
    'GALAXY Z FOLD5','GALAXY Z FOLD6','GALAXY Z FOLD7',
  ].map(prefix => ({ prefix, grades: ['A+','A','B+','B','C+','C','D+','D'] })),
  refurbish: [
    'GALAXY NOTE20','GALAXY NOTE20 ULTRA',
    'GALAXY Z FLIP5','GALAXY Z FLIP6','GALAXY Z FLIP7',
    'GALAXY Z FOLD5','GALAXY Z FOLD6','GALAXY Z FOLD7',
  ].map(prefix => ({ prefix, grades: ['A+','B+','C+'] })),
  recycle: [
    'GALAXY S10','GALAXY S20','GALAXY S21','GALAXY S22','GALAXY S23','GALAXY S24','GALAXY S25',
    'GALAXY NOTE10','GALAXY NOTE20','GALAXY Z FLIP','GALAXY Z FOLD',
    'GALAXY A52','GALAXY A53','GALAXY A54',
  ].map(prefix => ({ prefix, grades: ['E'] })),
};

// ── Bar/S 시리즈 CRN·Refurbish 자동 생성 ─────────────────────────────
// N = 업로드된 데이터에서 감지된 최신 Galaxy S 세대 번호 (discoverNModels 참고)
const BAR_S_CRN_OFFSETS = [-1, -2, -3];             // N-1 ~ N-3
const BAR_S_CRN_SUFFIXES = ['', ' FE', '+', ' ULTRA'];
const BAR_S_CRN_GRADES = ['A+','A','B+','B','C+','C','D+','D'];

const BAR_S_REFURBISH_OFFSETS = [0, -1, -2, -3, -4, -5]; // N ~ N-5
const BAR_S_REFURBISH_SUFFIXES = ['', '+', ' ULTRA'];
const BAR_S_REFURBISH_GRADES = ['A+','B+','C+'];

function generateBarSeriesRows(nModel, offsets, suffixes, grades) {
  if (!nModel) return [];
  const rows = [];
  for (const off of offsets) {
    const gen = nModel + off;
    if (gen <= 0) continue;
    for (const suf of suffixes) {
      rows.push({ prefix: `GALAXY S${gen}${suf}`, grades: [...grades] });
    }
  }
  return rows;
}

// 수동 표(state.ruleConfig)의 사용자 지정 행을 우선하고, 그 뒤에 자동 계산된
// Bar/S 행을 덧붙인다 — matchRuleTable()은 동일 길이 prefix가 여러 개 있으면
// 배열에서 먼저 나온 쪽을 채택하므로, 사용자가 특정 S 세대를 직접 등록해
// 덮어쓰고 싶을 때도 그대로 반영된다.
function getEffectiveRuleTable(catKey) {
  const cfg = state.ruleConfig || DEFAULT_RULE_CONFIG;
  const manualRows = cfg[catKey] || [];
  if (catKey === 'crn') {
    return [...manualRows, ...generateBarSeriesRows(state.nModels.S, BAR_S_CRN_OFFSETS, BAR_S_CRN_SUFFIXES, BAR_S_CRN_GRADES)];
  }
  if (catKey === 'refurbish') {
    return [...manualRows, ...generateBarSeriesRows(state.nModels.S, BAR_S_REFURBISH_OFFSETS, BAR_S_REFURBISH_SUFFIXES, BAR_S_REFURBISH_GRADES)];
  }
  return manualRows; // recycle: 자동 생성 없이 수동 표 그대로 사용
}

// discoverNModels() 이후 한 번 호출해 CRN/Refurbish/Recycle 매칭에 쓸 표를
// 캐싱한다 (레코드마다 매번 다시 만들지 않기 위함). Rule 탭 Excel 시트도
// 이 값을 그대로 읽어 실제 적용된 규칙을 보여준다.
function buildEffectiveRuleTables() {
  state.effectiveRuleTables = {
    crn: getEffectiveRuleTable('crn'),
    refurbish: getEffectiveRuleTable('refurbish'),
    recycle: getEffectiveRuleTable('recycle'),
  };
  return state.effectiveRuleTables;
}

function loadRuleConfig() {
  try {
    const raw = localStorage.getItem(RULE_STORAGE_KEY);
    if (!raw) return cloneDefaultRuleConfig();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.crn) || !Array.isArray(parsed.refurbish) || !Array.isArray(parsed.recycle)) {
      return cloneDefaultRuleConfig();
    }
    return parsed;
  } catch (e) {
    return cloneDefaultRuleConfig();
  }
}

function saveRuleConfigToStorage(cfg) {
  localStorage.setItem(RULE_STORAGE_KEY, JSON.stringify(cfg));
}

state.ruleConfig = loadRuleConfig();

// 하이픈/언더스코어를 공백으로 통일해 "Galaxy-A53 5G" 같은 원본 데이터가
// Rule Management 표의 "GALAXY A53"(공백) 항목과도 매칭되게 한다 — 실제
// 데이터는 A 시리즈에서 하이픈("Galaxy-A52s 5G")을 쓰는 경우가 많아, 정규화
// 없이 startsWith만 쓰면 표에 등록해도 절대 매칭되지 않는 문제가 있었다.
function normalizeModelPrefix(s) {
  return String(s || '').trim().toUpperCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
}

// 시장명(marketName)에 대해 table 내에서 가장 길게(가장 구체적으로) 일치하는
// prefix row를 찾고, 그 row의 grades에 rec의 원본 등급이 포함되는지 확인한다.
function matchRuleTable(table, marketName, grade) {
  const target = normalizeModelPrefix(marketName);
  const g = String(grade || '').trim().toUpperCase();
  if (!target || !Array.isArray(table)) return { pass: false };

  let best = null;
  for (const row of table) {
    const rawPrefix = String(row.prefix || '').trim().toUpperCase();
    const p = normalizeModelPrefix(rawPrefix);
    if (!p) continue;
    if (target.startsWith(p) && (!best || p.length > best.normLen)) {
      best = { prefix: rawPrefix, normLen: p.length, grades: row.grades || [] };
    }
  }
  if (!best) return { pass: false };
  const allowed = best.grades.map(x => String(x).toUpperCase());
  if (allowed.includes(g)) return { pass: true, matchedPrefix: best.prefix };
  return { pass: false, matchedPrefix: best.prefix };
}

// ============================================================
// GRADE NORMALIZER
// ============================================================
const GRADE_MAP = {
  'A+':'A','A':'A','A-':'A',
  'B+':'B','B':'B','B-':'B',
  'C+':'C','C':'C','C-':'C',
  'D+':'D','D':'D','D-':'D',
  'E':'E'
};
function normalizeGrade(g) {
  if (!g) return null;
  const s = String(g).trim().toUpperCase();
  return GRADE_MAP[s] || null;
}

// ============================================================
// MODEL PARSER
// ============================================================
function extractSeriesInfo(marketName) {
  if (!marketName) return { series:'Unknown', num:0 };
  const s = String(marketName);
  let m;
  m = s.match(/Galaxy\s+S(\d+)/i);
  if (m) return { series:'S', num:parseInt(m[1]) };
  m = s.match(/Galaxy\s+A(\d+)/i);
  if (m) return { series:'A', num:parseInt(m[1]) };
  m = s.match(/Galaxy\s+Z/i);
  if (m) {
    // Z 시리즈: Fold/Flip 번호 추출
    const fn = s.match(/(?:Fold|Flip)\s*(\d+)/i);
    return { series:'Z', num: fn ? parseInt(fn[1]) : 0 };
  }
  m = s.match(/Note\s*(\d+)/i);
  if (m) return { series:'Note', num:parseInt(m[1]) };
  return { series:'Unknown', num:0 };
}

function determineModelType(marketName) {
  if (!marketName) return 'Unknown';
  const s = String(marketName).toLowerCase();
  if (s.includes('fold') || s.includes('flip') || (s.includes('galaxy z') && !s.includes('galaxy s'))) return 'FF';
  if (s.includes('galaxy s') || s.includes('galaxy a')) return 'Bar';
  return 'Unknown';
}

// ============================================================
// N-MODEL ENGINE
// ============================================================
function discoverNModels(records) {
  const sets = { S:new Set(), A:new Set(), Z:new Set() };
  for (const r of records) {
    if (r.series in sets && r.seriesNum > 0) sets[r.series].add(r.seriesNum);
  }
  for (const k of Object.keys(sets)) {
    state.nModels[k] = sets[k].size ? Math.max(...sets[k]) : null;
  }
  log(`N-Model: S${state.nModels.S || '?'} / A${state.nModels.A || '?'} / Z(FF)${state.nModels.Z || '?'}`, 'info');
}

function getNModel(series) { return state.nModels[series] || null; }

// ============================================================
// ALLOCATION RULE ENGINE
// ============================================================
function applyRules(rec) {
  // 1. 필수 필드 검증
  if (!rec.imei || !rec.marketName) {
    const missing = [];
    if (!rec.imei) missing.push('IMEI');
    if (!rec.marketName) missing.push('Market Name');
    return { result:'Unclassified', reason:`Missing required fields: ${missing.join(', ')}` };
  }
  if (rec.normalizedGrade === null) {
    return { result:'Unclassified', reason:`Invalid Grade: ${rec.grade}` };
  }

  // 2. B2B 제외
  if (String(rec.b2bApp).trim().toUpperCase() === 'Y') {
    return { result:'Excluded', reason:'B2B App = Y (excluded from allocation)' };
  }

  // 3. CRN (규칙 관리 탭의 모델별 등급 테이블 기준)
  const crn = checkCRN(rec);
  if (crn.pass) return { result:'CRN', reason:crn.reason };

  // 4. Refurbish (규칙 관리 탭의 모델별 등급 테이블 기준)
  const ref = checkRefurbish(rec);
  if (ref.pass) return { result:'Refurbish', reason:ref.reason };

  // 5. Recycle (규칙 관리 탭의 모델별 등급 테이블 기준)
  const rcl = checkRecycle(rec);
  if (rcl.pass) return { result:'Recycle', reason:rcl.reason };

  // 6. Auction (나머지 전부)
  return { result:'Auction', reason:'Auction: does not meet CRN/Refurbish/Recycle criteria' };
}

function checkCRN(rec) {
  const table = (state.effectiveRuleTables || buildEffectiveRuleTables()).crn;
  const m = matchRuleTable(table, rec.marketName, rec.grade);
  if (m.pass) return { pass:true, reason:`CRN: '${m.matchedPrefix}' model, Grade ${rec.grade}` };
  return { pass:false };
}

function checkRefurbish(rec) {
  const table = (state.effectiveRuleTables || buildEffectiveRuleTables()).refurbish;
  const m = matchRuleTable(table, rec.marketName, rec.grade);
  if (m.pass) return { pass:true, reason:`Refurbish: '${m.matchedPrefix}' model, Grade ${rec.grade}` };
  return { pass:false };
}

// Recycle은 Python 엔진과 동일하게 "모델과 무관하게 정규화 등급이 E이면
// 무조건 Recycle"을 기본 규칙으로 삼는다 (CRN/Refurbish 미해당 시). 아래
// Recycle 표는 그 기본 규칙에 대한 "추가 예외"용이다 — 표에 없는 모델이라도
// E등급이면 Recycle로 잡히고, 표는 특정 모델에 E 외의 등급도 Recycle시키고
// 싶을 때만 사용한다. (예전엔 표에 등록된 모델만 Recycle이 가능해서, 표에
// 없는 모델은 E등급이어도 전부 Auction으로 새는 문제가 있었다.)
function checkRecycle(rec) {
  const table = (state.effectiveRuleTables || buildEffectiveRuleTables()).recycle;
  const m = matchRuleTable(table, rec.marketName, rec.grade);
  if (m.pass) return { pass:true, reason:`Recycle: '${m.matchedPrefix}' model, Grade ${rec.grade}` };
  if (rec.normalizedGrade === 'E') return { pass:true, reason:'Recycle: Grade E (model-agnostic default rule)' };
  return { pass:false };
}

// ============================================================
// COLUMN DETECTION
// ============================================================
// 과학적 표기법(3.5E+14) → 정수 문자열 변환
function normalizeIMEIValue(v) {
  const s = String(v || '').trim().replace(/\s/g, '');
  // 과학적 표기법 감지: 3.5E+14, 3.50023E+14 등
  if (/^[\d.]+[eE][+\-]?\d+$/.test(s)) {
    try {
      const n = Number(s);
      if (!isNaN(n) && isFinite(n)) return Math.round(n).toString();
    } catch(e) {}
  }
  return s;
}

function detectColumns(rows) {
  if (!rows.length) return {};
  const headers = Object.keys(rows[0]);
  const result = {};
  const sample = rows.slice(0, Math.min(50, rows.length));

  // ① 컬럼명 기반 우선 매핑 (가장 신뢰도 높음)
  const colNames = {
    imei:          ['imei','제품번호','imei번호'],
    marketName:    ['market name','marketname','market','product name','제품명','상품명'],
    model:         ['model','model code','model name','모델'],
    grade:         ['grade','등급'],
    b2bApp:        ['b2b app. y/n','b2b app. (y/n)','b2b app','b2b여부','b2b','b2bapp'],
    color:         ['color','colour','색상','컬러'],
    storage:       ['storage','용량','저장용량'],
    batteryHealth: ['battery health','배터리','battery'],
  };
  for (const [key, names] of Object.entries(colNames)) {
    for (const h of headers) {
      if (names.includes(h.toLowerCase().trim())) { result[key] = h; break; }
    }
  }

  // ② 값 기반 보완 (컬럼명으로 못 찾은 것만)

  // IMEI: 35로 시작하는 14-16자리
  if (!result.imei) {
    for (const h of headers) {
      if (result.imei) break;
      for (const row of sample) {
        const raw = String(row[h] || '').trim();
        const v = normalizeIMEIValue(raw);
        if (/^35\d{12,14}$/.test(v)) { result.imei = h; break; }
        if (/^3\.5\d*[eE]\+?1[45]$/i.test(raw)) { result.imei = h; break; }
      }
    }
  }

  // Market Name: Galaxy 포함
  if (!result.marketName) {
    for (const h of headers) {
      if (result.marketName) break;
      for (const row of sample) {
        if (/galaxy|note\s*\d|watch/i.test(String(row[h] || ''))) { result.marketName = h; break; }
      }
    }
  }

  // Model: SM- 로 시작
  if (!result.model) {
    for (const h of headers) {
      if (result.model) break;
      for (const row of sample) {
        if (/^SM-/i.test(String(row[h] || '').trim())) { result.model = h; break; }
      }
    }
  }

  // Grade: A-E ± 패턴이 샘플의 30% 이상
  if (!result.grade) {
    for (const h of headers) {
      if (result.grade) break;
      const vals = sample.map(r => String(r[h] || '').trim().toUpperCase()).filter(v => v);
      const cnt = vals.filter(v => /^[A-E][+\-]?$/.test(v)).length;
      if (vals.length > 0 && cnt / vals.length >= 0.3) result.grade = h;
    }
  }

  // B2B: Y/N 패턴이 샘플의 70% 이상 — 오인식 방지를 위해 높은 임계값 사용
  if (!result.b2bApp) {
    for (const h of headers) {
      if (result.b2bApp) break;
      const vals = sample.map(r => String(r[h] || '').trim().toUpperCase()).filter(v => v);
      const cnt = vals.filter(v => v === 'Y' || v === 'N').length;
      if (vals.length > 0 && cnt / vals.length >= 0.7) result.b2bApp = h;
    }
  }

  log(`Column mapping: IMEI=${result.imei||'?'} | MarketName=${result.marketName||'?'} | Grade=${result.grade||'?'} | B2B=${result.b2bApp||'?'}`, 'info');
  return result;
}

// ============================================================
// IMEI VALIDATION
// ============================================================
function validateIMEI(imei) {
  if (!imei) return { valid:false, msg:'IMEI value missing' };
  const s = normalizeIMEIValue(String(imei).trim());
  if (!s) return { valid:false, msg:'IMEI value missing' };
  if (!/^\d+$/.test(s)) return { valid:false, msg:`IMEI contains non-numeric characters: ${s}` };
  if (s.length < 14 || s.length > 16) return { valid:false, msg:`IMEI length error: ${s.length} digits (14-16 required)` };
  if (!s.startsWith('35')) return { valid:false, msg:`IMEI must start with 35` };
  return { valid:true, imei:s };
}

// ============================================================
// FILE UPLOAD & PARSING
// ============================================================
let loadedFile = null;

document.getElementById('file-input').addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) onFileSelected(f);
});

const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) onFileSelected(f);
});

function onFileSelected(file) {
  loadedFile = file;
  document.getElementById('file-label').textContent = `${file.name} (${(file.size/1024).toFixed(1)} KB)`;
  document.getElementById('btn-run').disabled = false;
  log(`File selected: ${file.name}`, 'info');
}

function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        // [1] XLSX 라이브러리 로드 확인
        if (typeof XLSX === 'undefined') {
          reject(new Error('XLSX library not loaded — check internet connection')); return;
        }

        const ab = e.target.result;
        const data = new Uint8Array(ab);

        // Workbook read — try multiple options
        let wb;
        const readOpts = [
          { type: 'array', cellHTML: false, cellText: false, cellNF: false, cellStyles: false },
          { type: 'array' },
          { type: 'array', bookVBA: false, bookFiles: false, bookProps: false },
        ];
        let lastErr = null;
        for (const opts of readOpts) {
          try {
            wb = XLSX.read(data, opts);
            if (wb && wb.SheetNames && wb.SheetNames.length) break;
          } catch(re) {
            lastErr = re;
            wb = null;
          }
        }
        if (!wb) { reject(new Error('XLSX.read failed: ' + (lastErr ? lastErr.message : 'unknown'))); return; }

        if (!wb.SheetNames || !wb.SheetNames.length) {
          reject(new Error('No sheets found')); return;
        }
        const sheetName = wb.SheetNames[0];

        if (!wb.Sheets) { reject(new Error('wb.Sheets missing')); return; }
        const ws = wb.Sheets[sheetName];
        if (!ws) { reject(new Error(`Sheet not found: "${sheetName}"`)); return; }

        let rawArr;
        try { rawArr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }); }
        catch(se) { reject(new Error('sheet_to_json failed: ' + se.message)); return; }

        if (!Array.isArray(rawArr) || rawArr.length === 0) { resolve([]); return; }

        // Auto-detect header row
        const headerKeywords = ['imei','grade','market','model','galaxy','품번','등급','제품','b2b','color','storage','battery'];
        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(10, rawArr.length); i++) {
          const row = rawArr[i];
          if (!Array.isArray(row)) continue;
          const rowStr = row.map(c => String(c == null ? '' : c)).join(' ').toLowerCase();
          if (headerKeywords.some(k => rowStr.includes(k))) { headerRowIdx = i; break; }
        }
        const headerRow = Array.isArray(rawArr[headerRowIdx]) ? rawArr[headerRowIdx] : [];
        if (!headerRow.length) { resolve([]); return; }
        const headers = headerRow.map((h, idx) =>
          (h != null && String(h).trim() !== '') ? String(h).trim() : `__col_${idx}`
        );

        // Parse data rows
        const rows = [];
        for (let i = headerRowIdx + 1; i < rawArr.length; i++) {
          const row = Array.isArray(rawArr[i]) ? rawArr[i] : [];
          if (row.every(v => v === '' || v === null || v === undefined)) continue;
          const obj = {};
          headers.forEach((h, idx) => { obj[h] = (row[idx] != null) ? row[idx] : ''; });
          rows.push(obj);
        }
        resolve(rows);
      } catch(err) {
        console.error('parseExcel error:', err.stack || err);
        reject(new Error('Parse error: ' + err.message));
      }
    };
    reader.onerror = err => reject(new Error('File read failed: ' + err));
    reader.readAsArrayBuffer(file);
  });
}

// CSV 한 행을 필드 배열로 파싱 (따옴표 내 쉼표/줄바꿈 처리)
function parseCSVLine(line, delim) {
  const fields = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delim && !inQ) {
      fields.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

function parseCSVText(text) {
  // BOM 제거
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/);

  const firstLine = lines[0] || '';
  const delim = (firstLine.split('\t').length > firstLine.split(',').length) ? '\t' : ',';

  const keywords = ['imei','grade','market','model','galaxy','b2b','color','storage','battery','등급','제품','상품'];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (!lines[i].trim()) continue;
    const rowStr = lines[i].toLowerCase();
    if (keywords.some(k => rowStr.includes(k))) { headerIdx = i; break; }
  }

  const headers = parseCSVLine(lines[headerIdx], delim).map((h, idx) =>
    h !== '' ? h.replace(/^"|"$/g, '').trim() : `__col_${idx}`
  );
  log(`CSV headers (${headers.length}): ${headers.slice(0,10).join(' | ')}`, 'info');

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const vals = parseCSVLine(line, delim);
    if (vals.every(v => !v)) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = vals[idx] !== undefined ? vals[idx] : ''; });
    rows.push(obj);
  }
  return rows;
}

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    // UTF-8 먼저 시도, 실패 시 EUC-KR
    const tryRead = (encoding) => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsText(file, encoding);
    });

    tryRead('utf-8').then(text => {
      try {
        // 깨진 문자가 많으면 EUC-KR 재시도
        const garbled = (text.match(/ /g) || []).length;
        if (garbled > 10) return tryRead('euc-kr');
        return text;
      } catch(e) { return tryRead('euc-kr'); }
    }).then(text => {
      try {
        const rows = parseCSVText(typeof text === 'string' ? text : '');
        resolve(rows);
      } catch(err) { reject(err); }
    }).catch(reject);
  });
}

function parseJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        // extract_to_json.py 출력 형식: { records: [...] }
        if (data && Array.isArray(data.records)) {
          log(`JSON format detected: ${data.sourceFile || file.name}, ${data.totalRows || data.records.length} records`, 'info');
          resolve(data.records);
        } else if (Array.isArray(data)) {
          resolve(data);
        } else {
          reject(new Error('JSON format error: records array not found'));
        }
      } catch(err) {
        reject(new Error('JSON parse failed: ' + err.message));
      }
    };
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
}

// ============================================================
// MAIN ALLOCATION RUN
// ============================================================
async function runAllocation() {
  if (!loadedFile) return;

  setProgress(0);
  document.getElementById('btn-run').disabled = true;
  log('=== Final Confirmation Started ===', 'info');

  try {
    let rawRows;
    if (loadedFile.type === 'clipboard') {
      rawRows = state.rawData;
      log(`Using clipboard data: ${rawRows.length.toLocaleString()} rows`, 'info');
    } else {
      log(`Parsing file: ${loadedFile.name}`, 'info');
      try {
        if (loadedFile.name.toLowerCase().endsWith('.csv')) {
          rawRows = await parseCSV(loadedFile);
        } else if (loadedFile.name.toLowerCase().endsWith('.json')) {
          rawRows = await parseJSON(loadedFile);
        } else {
          rawRows = await parseExcel(loadedFile);
        }
      } catch(parseErr) {
        log(`Failed to parse the file: ${parseErr.message}`, 'error');
        console.error('parseErr full:', parseErr);
        document.getElementById('btn-run').disabled = false;
        return;
      }
    }

    if (!rawRows || !rawRows.length) {
      log('No data found. Please try again.', 'error');
      document.getElementById('btn-run').disabled = false;
      return;
    }
    log(`Loaded ${rawRows.length.toLocaleString()} rows`, 'info');
    setProgress(20);

    let colMap;
    try {
      colMap = detectColumns(rawRows);
    } catch(colErr) {
      log(`Column detection failed: ${colErr.message}`, 'error');
      document.getElementById('btn-run').disabled = false;
      return;
    }
    log(`Columns: IMEI=${colMap.imei||'?'}, MarketName=${colMap.marketName||'?'}, Grade=${colMap.grade||'?'}, B2B=${colMap.b2bApp||'none'}`, 'info');

    if (!colMap.imei && !colMap.marketName && !colMap.grade) {
      log('Required columns not found. Please check the file.', 'error');
      document.getElementById('btn-run').disabled = false;
      return;
    }
    setProgress(30);

    const partials = [];
    let errorCount = 0;
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const imeiRaw = colMap.imei ? String(row[colMap.imei] || '').trim() : '';
      const { valid, imei: imeiClean, msg } = validateIMEI(imeiRaw);

      const marketName = colMap.marketName ? String(row[colMap.marketName] || '').trim() : '';
      const model = colMap.model ? String(row[colMap.model] || '').trim() : '';
      const grade = colMap.grade ? String(row[colMap.grade] || '').trim() : '';
      const b2bApp = colMap.b2bApp ? String(row[colMap.b2bApp] || '').trim() : 'N';
      const color = colMap.color ? String(row[colMap.color] || '').trim() : '';
      const storage = colMap.storage ? String(row[colMap.storage] || '').trim() : '';
      const batteryHealth = colMap.batteryHealth ? String(row[colMap.batteryHealth] || '').trim() : '';

      const normalizedGrade = normalizeGrade(grade);
      const { series, num } = extractSeriesInfo(marketName);
      const modelType = determineModelType(marketName);

      if (!valid && imeiRaw) {
        errorCount++;
        partials.push({
          idx: i+1, imei:'(ERROR)', marketName, model, grade,
          normalizedGrade:null, series, seriesNum:num,
          modelType, b2bApp, color, storage, batteryHealth,
          allocationResult:'ERROR', reason:`IMEI error: ${msg}`,
        });
        continue;
      }

      partials.push({
        idx: i+1,
        imei: imeiClean || imeiRaw,
        marketName, model, grade,
        normalizedGrade, series, seriesNum:num,
        modelType, b2bApp, color, storage, batteryHealth,
        allocationResult:'', reason:'',
      });
    }
    log(`Parse complete: ${partials.length} rows (errors: ${errorCount})`, errorCount > 0 ? 'warn' : 'info');
    setProgress(50);

    discoverNModels(partials);
    buildEffectiveRuleTables();
    setProgress(60);

    let batchSize = 500;
    for (let i = 0; i < partials.length; i += batchSize) {
      const chunk = partials.slice(i, i+batchSize);
      for (const rec of chunk) {
        if (rec.allocationResult === 'ERROR') continue;
        const { result, reason } = applyRules(rec);
        rec.allocationResult = result;
        rec.reason = reason;
      }
      setProgress(60 + Math.round((i/partials.length)*30));
      if (i % 2000 === 0 && i > 0) await sleep(0);
    }
    log(`Rule engine complete: ${partials.length.toLocaleString()} records`, 'success');
    setProgress(90);

    state.rawData = rawRows;
    state.processed = partials;
    state.filtered = [...partials];
    state.page = 1;

    updateDashboard();
    setProgress(100);
    setTimeout(() => setProgress(-1), 800);

    const ts = new Date().toLocaleString('en-US');
    document.getElementById('timestamp').textContent = ts;

    const counts = countResults(partials);
    log(`=== Allocation Complete ===`, 'success');
    log(`CRN: ${counts.CRN}, Refurbish: ${counts.Refurbish}, Auction: ${counts.Auction}, Recycle: ${counts.Recycle}, Excluded: ${counts.Excluded}, Unclassified: ${counts.Unclassified}`, 'success');

    document.getElementById('btn-export-excel').disabled = false;
    document.getElementById('btn-dl-excel').disabled = false;
    document.getElementById('btn-export-csv').disabled = false;
    document.getElementById('btn-export-json').disabled = false;
  } catch(err) {
    log(`An unexpected error occurred: ${err.message}`, 'error');
    console.error(err);
  }

  document.getElementById('btn-run').disabled = false;
}
