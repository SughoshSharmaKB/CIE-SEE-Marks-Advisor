
/* ══════════════════════════════════════════
   DARK MODE
══════════════════════════════════════════ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeIconSun').style.display = theme === 'dark' ? 'none' : 'block';
  document.getElementById('themeIconMoon').style.display = theme === 'dark' ? 'block' : 'none';
  try { localStorage.setItem('cieAdvisorTheme', theme); } catch (e) {}
}
function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme');
  const newTheme = current === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  document.getElementById('themeIconSun').style.display = newTheme === 'dark' ? 'none' : 'block';
  document.getElementById('themeIconMoon').style.display = newTheme === 'dark' ? 'block' : 'none';
  
  if (typeof updateChartColors === 'function') updateChartColors();
}
(function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('cieAdvisorTheme'); } catch (e) {}
  if (saved) {
    applyTheme(saved);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark');
  } else {
    applyTheme('light');
  }
})();

/* ── Grade table (exact match with C gradeTable[]) ── */
const GRADES = [
  { g:'O',  min:90,  max:100,  pts:10, desc:'Outstanding'   },
  { g:'A+', min:80,  max:89.9, pts:9,  desc:'Excellent'     },
  { g:'A',  min:70,  max:79.9, pts:8,  desc:'Very Good'     },
  { g:'B+', min:60,  max:69.9, pts:7,  desc:'Good'          },
  { g:'B',  min:55,  max:59.9, pts:6,  desc:'Above Average' },
  { g:'C',  min:50,  max:54.9, pts:5,  desc:'Average'       },
  { g:'P',  min:40,  max:49.9, pts:4,  desc:'Pass'          },
  { g:'F',  min:0,   max:39.9, pts:0,  desc:'Fail'          }
];

function getGradeObj(pct) {
  for (const g of GRADES) if (pct >= g.min && pct <= g.max) return g;
  return GRADES[GRADES.length - 1];
}
function getGradeByName(name) {
  return GRADES.find(g => g.g === name) || GRADES[6];
}

/* ── State ── */
let state = {
  name: '', roll: '', numSubj: 4, targetSGPA: 8,
  subjects: [], currentSubj: 0
};

/* ── Populate grade reference table ── */
function buildGradeTable() {
  const tbody = document.getElementById('gradeTableBody');
  tbody.innerHTML = GRADES.map(g => {
    const bc = gradeBadgeClass(g.g);
    return `<tr>
      <td><span class="pill ${bc}" style="font-size:12px;padding:2px 10px">${g.g}</span></td>
      <td>${g.desc}</td>
      <td>${g.min}% – ${g.max}%</td>
      <td style="font-weight:600">${g.pts}</td>
    </tr>`;
  }).join('');
}
buildGradeTable();

/* ── Step progress ── */
const STEP_LABELS = ['Student info', 'Subject setup', 'Enter marks', 'Results'];
function renderProgress(active) {
  const el = document.getElementById('stepProgress');
  el.innerHTML = STEP_LABELS.map((lbl, i) => {
    const cls = i < active ? 'done' : i === active ? 'active' : '';
    const numContent = i < active
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
      : (i + 1);
    const sep = i < STEP_LABELS.length - 1 ? '<div class="step-sep"></div>' : '';
    return `<div class="step-progress-item ${cls}">
      <div class="step-num">${numContent}</div>
      <span>${lbl}</span>
    </div>${sep}`;
  }).join('');
}
renderProgress(0);

function goToStep(n) {
  document.querySelectorAll('.step').forEach((s, i) => s.classList.toggle('active', i === n));
  renderProgress(n);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Slider display ── */
document.getElementById('sgpaSlider').addEventListener('input', function() {
  document.getElementById('sgpaDisplay').textContent = parseFloat(this.value).toFixed(1);
});

/* ══════════════════════════════════════════
   CSV / EXCEL IMPORT
   ------------------------------------------
   Mirrors the C program's loadFromCSV(): the
   user fills the Excel template, saves it as
   CSV (File > Save As > CSV), and uploads it
   here. Expected columns, in order:
   StudentName, RollNo, SubjectName, Credits,
   CourseType, Quiz1, Quiz2, Test1, Test2,
   ExpLearning, LabExercise, LabTest,
   Innovative, SEE, TargetGrade
   Empty cell = component not yet completed.
══════════════════════════════════════════ */

/* Splits one CSV line into fields, preserving empty fields
   (e.g. "a,,c" -> ["a","","c"]), same behaviour as the C
   splitCSVLine() function. Does not support quoted commas. */
function splitCSVLine(line) {
  return line.split(',').map(f => f.replace(/\r$/, '').trim());
}

function parseCourseTypeCSV(txt) {
  if (txt === 'Theory')      return 'theory';
  if (txt === 'Theory+Lab')  return 'theory_lab';
  if (txt === 'Lab')         return 'lab_only';
  return 'theory';
}

/* Extracts rows (array-of-arrays, header row included) from
   either a binary .xlsx/.xls workbook (via SheetJS) or a plain
   .csv text file, then routes both through the same row
   processor so the rest of the logic stays unified. */
function handleCSVUpload(event) {
  const file = event.target.files[0];
  const statusEl = document.getElementById('csvStatus');
  const nameEl = document.getElementById('csvFileName');
  if (!file) return;
  nameEl.textContent = file.name;
  statusEl.innerHTML = `<div class="alert alert-info">${ICON_INFO} Reading ${file.name}…</div>`;

  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        if (typeof XLSX === 'undefined') {
          throw new Error('Excel reader library failed to load. Check your internet connection, or upload a .csv file instead.');
        }
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        /* Prefer a sheet literally named "Marks Data" (as in the
           supplied template); otherwise fall back to the first sheet. */
        const sheetName = workbook.SheetNames.includes('Marks Data')
          ? 'Marks Data' : workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
        processRows(rows, statusEl);
      } catch (err) {
        statusEl.innerHTML = `<div class="alert alert-danger">${ICON_ERR} Could not parse Excel file: ${err.message}</div>`;
      }
    };
    reader.onerror = function() {
      statusEl.innerHTML = `<div class="alert alert-danger">${ICON_ERR} Failed to read file.</div>`;
    };
    reader.readAsArrayBuffer(file);

  } else if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const text = e.target.result;
        const rows = text.split('\n')
          .filter(l => l.trim().length > 0)
          .map(line => splitCSVLine(line));
        processRows(rows, statusEl);
      } catch (err) {
        statusEl.innerHTML = `<div class="alert alert-danger">${ICON_ERR} Could not parse file: ${err.message}</div>`;
      }
    };
    reader.onerror = function() {
      statusEl.innerHTML = `<div class="alert alert-danger">${ICON_ERR} Failed to read file.</div>`;
    };
    reader.readAsText(file);

  } else {
    statusEl.innerHTML = `<div class="alert alert-danger">${ICON_ERR} Unsupported file type ".${ext}". Please upload .xlsx, .xls, or .csv.</div>`;
  }
}

/* Shared row processor: takes an array of row-arrays (first row
   = header, rest = data) and populates state.subjects, regardless
   of whether the rows came from SheetJS or manual CSV splitting. */
function processRows(rows, statusEl) {
  try {
    if (!rows || rows.length < 2) throw new Error('File has no data rows.');

    const dataRows = rows.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
    if (dataRows.length === 0) throw new Error('No valid subject rows found.');
    if (dataRows.length > 8) throw new Error('Maximum 8 subjects supported.');

    const newSubjects = [];
    let studentName = '', studentRoll = '';

    dataRows.forEach((row, idx) => {
      /* Normalise to 15 string fields regardless of source */
      const f = [];
      for (let c = 0; c < 15; c++) f.push(row[c] !== undefined && row[c] !== null ? String(row[c]).trim() : '');

      if (idx === 0) { studentName = f[0]; studentRoll = f[1]; }

      const sub = {
        name: f[2] || `Subject ${idx + 1}`,
        credits: parseInt(f[3]) || 3,
        type: parseCourseTypeCSV(f[4]),
        targetGrade: f[14] || 'A',
        q1done:false, q2done:false, t1done:false, t2done:false, expdone:false,
        labExDone:false, labTestDone:false, innovDone:false, seeDone:false,
        q1:null, q2:null, t1:null, t2:null, exp:null,
        labEx:null, labTest:null, innov:null, see:null
      };

      if (f[5]  !== '') { sub.q1      = parseFloat(f[5]);  sub.q1done     = true; }
      if (f[6]  !== '') { sub.q2      = parseFloat(f[6]);  sub.q2done     = true; }
      if (f[7]  !== '') { sub.t1      = parseFloat(f[7]);  sub.t1done     = true; }
      if (f[8]  !== '') { sub.t2      = parseFloat(f[8]);  sub.t2done     = true; }
      if (f[9]  !== '') { sub.exp     = parseFloat(f[9]);  sub.expdone    = true; }
      if (f[10] !== '') { sub.labEx   = parseFloat(f[10]); sub.labExDone  = true; }
      if (f[11] !== '') { sub.labTest = parseFloat(f[11]); sub.labTestDone= true; }
      if (f[12] !== '') { sub.innov   = parseFloat(f[12]); sub.innovDone  = true; }
      if (f[13] !== '') { sub.see     = parseFloat(f[13]); sub.seeDone    = true; }

      newSubjects.push(sub);
    });

    /* Populate state and pre-fill step 0 fields */
    state.name = studentName || 'Student';
    state.roll = studentRoll || '--';
    state.numSubj = newSubjects.length;
    state.subjects = newSubjects;

    document.getElementById('stuName').value = state.name;
    document.getElementById('stuRoll').value = state.roll;
    document.getElementById('numSubj').value = state.numSubj;

    statusEl.innerHTML = `<div class="alert alert-ok">${ICON_OK} Loaded <strong>${newSubjects.length}</strong> subject(s) for <strong>${state.name}</strong> (${state.roll}). Click "Set up subjects" below to review, or jump straight to results.</div>`;
    statusEl.innerHTML += `<button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="jumpToResultsFromCSV()">Skip to results <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>`;

  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert-danger">${ICON_ERR} Could not parse file: ${err.message}</div>`;
  }
}

/* Jump directly from CSV upload to the results step,
   bypassing manual subject setup and marks entry. */
function jumpToResultsFromCSV() {
  state.targetSGPA = parseFloat(document.getElementById('sgpaSlider').value);
  buildSubjectSetup();   /* keeps step 1 in sync if user goes back */
  buildMarksTabs();      /* keeps step 2 in sync if user goes back */
  compute();
}

/* ── Step 0 → 1: student info ── */
function goStep1() {
  state.name = document.getElementById('stuName').value.trim() || 'Student';
  state.roll = document.getElementById('stuRoll').value.trim() || '--';
  const n = parseInt(document.getElementById('numSubj').value);
  if (!n || n < 1 || n > 8) { alert('Please enter between 1 and 8 subjects.'); return; }
  state.numSubj = n;
  state.targetSGPA = parseFloat(document.getElementById('sgpaSlider').value);

  /* Initialise subjects array (preserve existing if re-navigating) */
  while (state.subjects.length < state.numSubj) {
    const i = state.subjects.length;
    state.subjects.push({
      name: `Subject ${i + 1}`, credits: 3, type: 'theory', targetGrade: 'A',
      q1done:false, q2done:false, t1done:false, t2done:false, expdone:false,
      labExDone:false, labTestDone:false, innovDone:false, seeDone:false,
      q1:null, q2:null, t1:null, t2:null, exp:null,
      labEx:null, labTest:null, innov:null, see:null
    });
  }
  state.subjects = state.subjects.slice(0, state.numSubj);
  buildSubjectSetup();
  goToStep(1);
}

/* ── Build subject setup cards ── */
function buildSubjectSetup() {
  const c = document.getElementById('subjSetupCards');
  c.innerHTML = '';
  state.subjects.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div class="card-title" style="margin-bottom:.75rem">
        <span class="badge badge-purple">Subject ${i + 1}</span>
      </div>
      <div class="grid3" style="margin-bottom:10px">
        <div style="grid-column:span 1">
          <label class="field-label">Subject name</label>
          <input type="text" value="${s.name}" oninput="state.subjects[${i}].name=this.value">
        </div>
        <div>
          <label class="field-label">Credits</label>
          <select onchange="state.subjects[${i}].credits=parseInt(this.value)">
            ${[1,2,3,4,5].map(v=>`<option value="${v}"${s.credits===v?' selected':''}>${v} credit${v>1?'s':''}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="field-label">Target grade</label>
          <select onchange="state.subjects[${i}].targetGrade=this.value">
            ${GRADES.filter(g=>g.g!=='F').map(g=>`<option value="${g.g}"${s.targetGrade===g.g?' selected':''}>${g.g} — ${g.desc}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <label class="field-label">Course type</label>
        <div class="radio-group">
          ${[['theory','Theory only','CIE = 100'],['theory_lab','Theory + Lab','CIE = 150'],['lab_only','Lab only','CIE = 50']].map(([val,lbl,sub])=>`
          <label class="radio-option${s.type===val?' selected':''}" id="ro_${i}_${val}">
            <input type="radio" name="type${i}" value="${val}" ${s.type===val?'checked':''} onchange="selectType(${i},'${val}')"> ${lbl} <span style="font-size:11px;opacity:.7">(${sub})</span>
          </label>`).join('')}
        </div>
      </div>`;
    c.appendChild(div);
  });
}

function selectType(i, val) {
  state.subjects[i].type = val;
  /* update radio option styling */
  ['theory','theory_lab','lab_only'].forEach(t => {
    const el = document.getElementById(`ro_${i}_${t}`);
    if (el) el.classList.toggle('selected', t === val);
  });
}

/* ── Step 1 → 2: marks entry ── */
function goStep2() {
  /* Read subject names/types in case user changed them */
  state.subjects.forEach((s, i) => {
    const nameEl = document.querySelector(`#subjSetupCards .card:nth-child(${i+1}) input[type="text"]`);
    if (nameEl) s.name = nameEl.value.trim() || `Subject ${i+1}`;
    const typeEl = document.querySelector(`input[name="type${i}"]:checked`);
    if (typeEl) s.type = typeEl.value;
  });
  state.currentSubj = 0;
  buildMarksTabs();
  goToStep(2);
}

/* ── Subject tabs ── */
function buildMarksTabs() {
  const tabs = document.getElementById('subjTabs');
  tabs.innerHTML = '';
  state.subjects.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.className = 'subj-tab-btn' + (i === 0 ? ' active' : '');
    btn.textContent = s.name;
    btn.onclick = () => {
      saveCurrentMarks(state.currentSubj);
      state.currentSubj = i;
      document.querySelectorAll('.subj-tab-btn').forEach((b, j) => b.classList.toggle('active', j === i));
      renderMarksPanel(i);
    };
    tabs.appendChild(btn);
  });
  renderMarksPanel(0);
}

/* ── Render marks input for one subject ── */
function renderMarksPanel(i) {
  const s = state.subjects[i];
  const panel = document.getElementById('marksPanel');
  const cieMax = { theory: 100, theory_lab: 150, lab_only: 50 }[s.type];
  const typeLbl = { theory: 'Theory only', theory_lab: 'Theory + Lab', lab_only: 'Lab only' }[s.type];

  let html = `<div class="card" id="markCard">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:8px">
      <div style="font-size:16px;font-weight:600">${s.name}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="badge badge-purple">${typeLbl}</span>
        <span class="badge badge-blue">Max CIE: ${cieMax}</span>
        <span class="badge badge-teal">${s.credits} credit${s.credits>1?'s':''}</span>
        <span class="badge badge-amber">Target: ${s.targetGrade}</span>
      </div>
    </div>`;

  /* ── THEORY / THEORY+LAB components ── */
  if (s.type === 'theory' || s.type === 'theory_lab') {

    html += `<div class="sec-label">Quizzes — Q1 + Q2 (each out of 10 = 20 total)</div>
    <div class="grid2">
      <div class="mark-box">
        <div class="mark-box-title"><span>Quiz 1</span><span class="badge badge-blue">Max 10</span></div>
        <div class="toggle-row">
          <input type="checkbox" id="q1done" ${s.q1done?'checked':''}>
          <span class="toggle-label" onclick="document.getElementById('q1done').click()">Quiz 1 completed</span>
        </div>
        <input type="number" id="q1val" min="0" max="10" step="0.5" placeholder="0 – 10" value="${s.q1??''}" ${s.q1done?'':'disabled'} style="width:110px">
      </div>
      <div class="mark-box">
        <div class="mark-box-title"><span>Quiz 2</span><span class="badge badge-blue">Max 10</span></div>
        <div class="toggle-row">
          <input type="checkbox" id="q2done" ${s.q2done?'checked':''}>
          <span class="toggle-label" onclick="document.getElementById('q2done').click()">Quiz 2 completed</span>
        </div>
        <input type="number" id="q2val" min="0" max="10" step="0.5" placeholder="0 – 10" value="${s.q2??''}" ${s.q2done?'':'disabled'} style="width:110px">
      </div>
    </div>`;

    html += `<div class="sec-label">Tests — each out of 50, final sum scaled to 40</div>
    <div class="grid2">
      <div class="mark-box">
        <div class="mark-box-title"><span>Test 1</span><span class="badge badge-blue">Max 50</span></div>
        <div class="toggle-row">
          <input type="checkbox" id="t1done" ${s.t1done?'checked':''}>
          <span class="toggle-label" onclick="document.getElementById('t1done').click()">Test 1 completed</span>
        </div>
        <input type="number" id="t1val" min="0" max="50" step="0.5" placeholder="0 – 50" value="${s.t1??''}" ${s.t1done?'':'disabled'} style="width:110px">
      </div>
      <div class="mark-box">
        <div class="mark-box-title"><span>Test 2</span><span class="badge badge-blue">Max 50</span></div>
        <div class="toggle-row">
          <input type="checkbox" id="t2done" ${s.t2done?'checked':''}>
          <span class="toggle-label" onclick="document.getElementById('t2done').click()">Test 2 completed</span>
        </div>
        <input type="number" id="t2val" min="0" max="50" step="0.5" placeholder="0 – 50" value="${s.t2??''}" ${s.t2done?'':'disabled'} style="width:110px">
      </div>
    </div>`;

    html += `<div class="sec-label">Experiential learning — out of 40</div>
    <div class="mark-box">
      <div class="mark-box-title"><span>Exp. Learning (Case study + Program req. + Video seminar + Demo)</span><span class="badge badge-blue">Max 40</span></div>
      <div class="toggle-row">
        <input type="checkbox" id="expdone" ${s.expdone?'checked':''}>
        <span class="toggle-label" onclick="document.getElementById('expdone').click()">Experiential learning completed</span>
      </div>
      <input type="number" id="expval" min="0" max="40" step="0.5" placeholder="0 – 40" value="${s.exp??''}" ${s.expdone?'':'disabled'} style="width:110px">
    </div>`;
  }

  /* ── THEORY+LAB lab components ── */
  if (s.type === 'theory_lab') {
    html += `<hr><div class="sec-label">Lab components (CIE: Lab exercises + Lab test = 50)</div>
    <div class="grid2">
      <div class="mark-box">
        <div class="mark-box-title"><span>Lab exercises + report + observation</span><span class="badge badge-green">Max 40</span></div>
        <div class="toggle-row">
          <input type="checkbox" id="labExDone" ${s.labExDone?'checked':''}>
          <span class="toggle-label" onclick="document.getElementById('labExDone').click()">Lab exercises completed</span>
        </div>
        <input type="number" id="labExVal" min="0" max="40" step="0.5" placeholder="0 – 40" value="${s.labEx??''}" ${s.labExDone?'':'disabled'} style="width:110px">
      </div>
      <div class="mark-box">
        <div class="mark-box-title"><span>Lab test</span><span class="badge badge-green">Max 10</span></div>
        <div class="toggle-row">
          <input type="checkbox" id="labTestDone" ${s.labTestDone?'checked':''}>
          <span class="toggle-label" onclick="document.getElementById('labTestDone').click()">Lab test completed</span>
        </div>
        <input type="number" id="labTestVal" min="0" max="10" step="0.5" placeholder="0 – 10" value="${s.labTest??''}" ${s.labTestDone?'':'disabled'} style="width:110px">
      </div>
    </div>`;
  }

  /* ── LAB ONLY components ── */
  if (s.type === 'lab_only') {
    html += `<div class="sec-label">Lab exercises + report + observation — out of 30</div>
    <div class="mark-box">
      <div class="mark-box-title"><span>Lab exercises, report &amp; observation</span><span class="badge badge-green">Max 30</span></div>
      <div class="toggle-row">
        <input type="checkbox" id="labExDone" ${s.labExDone?'checked':''}>
        <span class="toggle-label" onclick="document.getElementById('labExDone').click()">Lab exercises completed</span>
      </div>
      <input type="number" id="labExVal" min="0" max="30" step="0.5" placeholder="0 – 30" value="${s.labEx??''}" ${s.labExDone?'':'disabled'} style="width:110px">
    </div>

    <div class="sec-label">Lab test — out of 10</div>
    <div class="mark-box">
      <div class="mark-box-title"><span>Lab test</span><span class="badge badge-green">Max 10</span></div>
      <div class="toggle-row">
        <input type="checkbox" id="labTestDone" ${s.labTestDone?'checked':''}>
        <span class="toggle-label" onclick="document.getElementById('labTestDone').click()">Lab test completed</span>
      </div>
      <input type="number" id="labTestVal" min="0" max="10" step="0.5" placeholder="0 – 10" value="${s.labTest??''}" ${s.labTestDone?'':'disabled'} style="width:110px">
    </div>

    <div class="sec-label">Innovative experiment / concept design — out of 10</div>
    <div class="mark-box">
      <div class="mark-box-title"><span>Innovative experiment</span><span class="badge badge-green">Max 10</span></div>
      <div class="toggle-row">
        <input type="checkbox" id="innovDone" ${s.innovDone?'checked':''}>
        <span class="toggle-label" onclick="document.getElementById('innovDone').click()">Innovative experiment completed</span>
      </div>
      <input type="number" id="innovVal" min="0" max="10" step="0.5" placeholder="0 – 10" value="${s.innov??''}" ${s.innovDone?'':'disabled'} style="width:110px">
    </div>`;
  }

  /* ── SEE ── */
  html += `<hr>
  <div class="sec-label">SEE — Semester End Examination (out of 100) &nbsp;·&nbsp; Contributes 50% to final score</div>
  <div class="mark-box" style="background:var(--blue-lt);border:0.5px solid #B5D4F4">
    <div class="mark-box-title" style="color:var(--blue-dk)"><span>Semester End Exam</span><span class="badge badge-blue">Max 100</span></div>
    <div class="toggle-row">
      <input type="checkbox" id="seedone" ${s.seeDone?'checked':''}>
      <span class="toggle-label" onclick="document.getElementById('seedone').click()">SEE completed</span>
    </div>
    <input type="number" id="seeval" min="0" max="100" step="0.5" placeholder="0 – 100" value="${s.see??''}" ${s.seeDone?'':'disabled'} style="width:110px">
    <p style="font-size:11px;color:var(--blue-dk);margin-top:8px">Passing standard: SEE ≥ 35% &nbsp;|&nbsp; CIE ≥ 40%</p>
  </div>
  </div>`;

  panel.innerHTML = html;

  /* Attach toggle-enable listeners */
  [['q1done','q1val'],['q2done','q2val'],['t1done','t1val'],['t2done','t2val'],
   ['expdone','expval'],['labExDone','labExVal'],['labTestDone','labTestVal'],
   ['innovDone','innovVal'],['seedone','seeval']].forEach(([cbId, inId]) => {
    const cb = document.getElementById(cbId);
    const inp = document.getElementById(inId);
    if (!cb || !inp) return;
    cb.addEventListener('change', () => {
      inp.disabled = !cb.checked;
      if (!cb.checked) inp.value = '';
    });
  });
}

/* ── Save marks from current panel into state ── */
function saveCurrentMarks(i) {
  const s = state.subjects[i];
  const gv = id => { const e = document.getElementById(id); return e ? (parseFloat(e.value) || null) : null; };
  const gc = id => { const e = document.getElementById(id); return e ? e.checked : false; };
  s.q1done = gc('q1done');    s.q1 = gv('q1val');
  s.q2done = gc('q2done');    s.q2 = gv('q2val');
  s.t1done = gc('t1done');    s.t1 = gv('t1val');
  s.t2done = gc('t2done');    s.t2 = gv('t2val');
  s.expdone = gc('expdone');  s.exp = gv('expval');
  s.labExDone = gc('labExDone');     s.labEx   = gv('labExVal');
  s.labTestDone = gc('labTestDone'); s.labTest = gv('labTestVal');
  s.innovDone = gc('innovDone');     s.innov   = gv('innovVal');
  s.seeDone = gc('seedone');  s.see = gv('seeval');
}

/* ══════════════════════════════════════════
   AI PREDICTOR ENGINE (Linear Regression & Gradient Descent)
   ══════════════════════════════════════════ */

const quizModel = { w: 0.9, b: 0.5, name: "Quiz Model" };
const testModel = { w: 0.85, b: 5.0, name: "Test Model" };
const seeModel = { w: 0.9, b: 5.0, name: "SEE Model" };
const labTestModel = { w: 0.2, b: 1.0, name: "Lab Test Model" };

function trainModelJS(model, inputs, targets, lr, epochs) {
  const count = inputs.length;
  if (count === 0) return;
  
  let initial_loss = 0;
  for (let i = 0; i < count; i++) {
    const diff = (model.w * inputs[i] + model.b) - targets[i];
    initial_loss += diff * diff;
  }
  initial_loss /= count;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let grad_w = 0;
    let grad_b = 0;
    for (let i = 0; i < count; i++) {
      const pred = model.w * inputs[i] + model.b;
      const error = pred - targets[i];
      grad_w += error * inputs[i];
      grad_b += error;
    }
    model.w -= lr * (grad_w / count);
    model.b -= lr * (grad_b / count);
  }

  let final_loss = 0;
  for (let i = 0; i < count; i++) {
    const diff = (model.w * inputs[i] + model.b) - targets[i];
    final_loss += diff * diff;
  }
  final_loss /= count;

  console.log(`[AI] Trained ${model.name} on ${count} subjects. Loss: ${initial_loss.toFixed(4)} -> ${final_loss.toFixed(4)}, w: ${model.w.toFixed(2)}, b: ${model.b.toFixed(2)}`);
}

function trainAIJS() {
  const quiz_in = [], quiz_tg = [];
  const test_in = [], test_tg = [];
  const see_in = [], see_tg = [];
  const lab_in = [], lab_tg = [];

  state.subjects.forEach(s => {
    if (s.type === 'theory' || s.type === 'theory_lab') {
      if (s.q1done && s.q2done && s.q1 != null && s.q2 != null) {
        quiz_in.push(s.q1);
        quiz_tg.push(s.q2);
      }
      if (s.t1done && s.t2done && s.t1 != null && s.t2 != null) {
        test_in.push(s.t1);
        test_tg.push(s.t2);
      }
    }
    if (s.seeDone && s.see != null) {
      const maxCIE = getMaxCIE(s.type);
      const obtained = calcCIE(s);
      const ciePct = (obtained / maxCIE) * 100;
      see_in.push(ciePct);
      see_tg.push(s.see);
    }
    if (s.type === 'theory_lab' || s.type === 'lab_only') {
      if (s.labExDone && s.labTestDone && s.labEx != null && s.labTest != null) {
        lab_in.push(s.labEx);
        lab_tg.push(s.labTest);
      }
    }
  });

  if (quiz_in.length > 0 || test_in.length > 0 || see_in.length > 0 || lab_in.length > 0) {
    console.log("[AI] Training predictive models using Gradient Descent...");
    trainModelJS(quizModel, quiz_in, quiz_tg, 0.01, 500);
    trainModelJS(testModel, test_in, test_tg, 0.0005, 1000);
    trainModelJS(seeModel, see_in, see_tg, 0.0001, 1000);
    trainModelJS(labTestModel, lab_in, lab_tg, 0.0005, 500);
  }
}

function predictQuiz2(q1) {
  const pred = quizModel.w * q1 + quizModel.b;
  return Math.min(Math.max(pred, 0), 10);
}

function predictTest2(t1) {
  const pred = testModel.w * t1 + testModel.b;
  return Math.min(Math.max(pred, 0), 50);
}

function predictLabTest(labEx) {
  const pred = labTestModel.w * labEx + labTestModel.b;
  return Math.min(Math.max(pred, 0), 10);
}

function predictSEE(ciePct) {
  const pred = seeModel.w * ciePct + seeModel.b;
  return Math.min(Math.max(pred, 0), 100);
}

function predictExp(q1, t1) {
  const qPct = q1 / 10;
  const tPct = t1 / 50;
  const score = (0.3 * qPct + 0.7 * tPct) * 40;
  return Math.min(Math.max(score, 0), 40);
}

function getPredictedCIE(s) {
  let total = 0;
  let q1_val = s.q1 != null ? s.q1 : 7.5;
  let q2_val = s.q2 != null ? s.q2 : (s.q1done && s.q1 != null ? predictQuiz2(s.q1) : 7.5);
  
  let t1_val = s.t1 != null ? s.t1 : 37.5;
  let t2_val = s.t2 != null ? s.t2 : (s.t1done && s.t1 != null ? predictTest2(s.t1) : 37.5);

  let exp_val = s.exp != null ? s.exp : predictExp(q1_val, t1_val);

  if (s.type === 'theory' || s.type === 'theory_lab') {
    total += (s.q1done && s.q1 != null ? s.q1 : q1_val);
    total += (s.q2done && s.q2 != null ? s.q2 : q2_val);
    
    let tsum = 0;
    tsum += (s.t1done && s.t1 != null ? s.t1 : t1_val);
    tsum += (s.t2done && s.t2 != null ? s.t2 : t2_val);
    total += (tsum / 100) * 40;
    
    total += (s.expdone && s.exp != null ? s.exp : exp_val);
  }

  if (s.type === 'theory_lab') {
    let labEx_val = s.labEx != null ? s.labEx : (q1_val / 10 * 0.3 + t1_val / 50 * 0.7) * 40;
    let labTest_val = s.labTest != null ? s.labTest : predictLabTest(labEx_val);
    total += (s.labExDone && s.labEx != null ? s.labEx : labEx_val);
    total += (s.labTestDone && s.labTest != null ? s.labTest : labTest_val);
  }

  if (s.type === 'lab_only') {
    let labEx_val = s.labEx != null ? s.labEx : 22.5;
    let labTest_val = s.labTest != null ? s.labTest : predictLabTest(labEx_val);
    let innov_val = s.innov != null ? s.innov : (labEx_val / 30) * 10;
    total += (s.labExDone && s.labEx != null ? s.labEx : labEx_val);
    total += (s.labTestDone && s.labTest != null ? s.labTest : labTest_val);
    total += (s.innovDone && s.innov != null ? s.innov : innov_val);
  }
  return total;
}

/* ══════════════════════════════════════════
   CORE LOGIC (mirrors C functions exactly)
══════════════════════════════════════════ */

/* calcCIE() — mirrors C calcCIE() */
function calcCIE(s) {
  let total = 0;
  if (s.type === 'theory' || s.type === 'theory_lab') {
    if (s.q1done && s.q1 != null) total += s.q1;
    if (s.q2done && s.q2 != null) total += s.q2;
    let tsum = 0, tcnt = 0;
    if (s.t1done && s.t1 != null) { tsum += s.t1; tcnt++; }
    if (s.t2done && s.t2 != null) { tsum += s.t2; tcnt++; }
    if (tcnt > 0) total += (tsum / (tcnt * 50)) * 40;
    if (s.expdone && s.exp != null) total += s.exp;
  }
  if (s.type === 'theory_lab') {
    if (s.labExDone   && s.labEx   != null) total += s.labEx;
    if (s.labTestDone && s.labTest != null) total += s.labTest;
  }
  if (s.type === 'lab_only') {
    if (s.labExDone   && s.labEx   != null) total += s.labEx;
    if (s.labTestDone && s.labTest != null) total += s.labTest;
    if (s.innovDone   && s.innov   != null) total += s.innov;
  }
  return total;
}

/* getMaxCIE() — mirrors C getMaxCIE() */
function getMaxCIE(type) {
  return type === 'theory' ? 100 : type === 'theory_lab' ? 150 : 50;
}

/* pendingCIEMax() — mirrors C pendingCIEMax() */
function pendingCIEMax(s) {
  let p = 0;
  if (s.type === 'theory' || s.type === 'theory_lab') {
    if (!s.q1done) p += 10;
    if (!s.q2done) p += 10;
    if (!s.t1done && !s.t2done) p += 40;
    else if (!s.t1done || !s.t2done) p += 20;
    if (!s.expdone) p += 40;
  }
  if (s.type === 'theory_lab') {
    if (!s.labExDone)   p += 40;
    if (!s.labTestDone) p += 10;
  }
  if (s.type === 'lab_only') {
    if (!s.labExDone)   p += 30;
    if (!s.labTestDone) p += 10;
    if (!s.innovDone)   p += 10;
  }
  return p;
}

/* ── Badge colour helper ── */
function gradeBadgeClass(g) {
  if (g==='O'||g==='A+') return 'badge-green';
  if (g==='A' ||g==='B+') return 'badge-blue';
  if (g==='B' ||g==='C')  return 'badge-amber';
  if (g==='P') return 'badge-purple';
  return 'badge-red';
}
function gradePillStyle(g) {
  const map = {
    'O':  '#27500A:#EAF3DE', 'A+': '#27500A:#EAF3DE',
    'A':  '#0C447C:#E6F1FB', 'B+': '#0C447C:#E6F1FB',
    'B':  '#633806:#FAEEDA', 'C':  '#633806:#FAEEDA',
    'P':  '#3C3489:#EEEDFE', 'F':  '#791F1F:#FCEBEB'
  };
  const [fg, bg] = (map[g] || '#1a1a1a:#f0eff0').split(':');
  return `color:${fg};background:${bg}`;
}

/* ── Progress fill colour ── */
function pctFillColor(pct, threshold) {
  if (pct >= threshold + 20) return '#1D9E75';
  if (pct >= threshold)       return '#BA7517';
  return '#A32D2D';
}

/* ── Alert HTML ── */
const ICON_OK   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICON_WARN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
const ICON_ERR  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
const ICON_INFO = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

function alertOk(msg)     { return `<div class="alert alert-ok">${ICON_OK}${msg}</div>`; }
function alertWarn(msg)   { return `<div class="alert alert-warn">${ICON_WARN}${msg}</div>`; }
function alertDanger(msg) { return `<div class="alert alert-danger">${ICON_ERR}${msg}</div>`; }
function alertInfo(msg)   { return `<div class="alert alert-info">${ICON_INFO}${msg}</div>`; }

function progressBar(pct, colorClass, label, sublabel) {
  const clampedPct = Math.min(Math.max(pct, 0), 100);
  return `<div class="progress-wrap">
    <div class="progress-label"><span>${label}</span><span>${sublabel}</span></div>
    <div class="progress-bar"><div class="progress-fill ${colorClass}" style="width:${clampedPct.toFixed(1)}%"></div></div>
  </div>`;
}

/* ══════════════════════════════════════════
   COMPUTE & RENDER RESULTS
   (mirrors C computeSubject, adviseSubject, adviseSGPA)
══════════════════════════════════════════ */
function compute() {
  saveCurrentMarks(state.currentSubj);

  /* Train AI predictive models on entered subject pairs */
  trainAIJS();

  /* Compute all subjects */
  const results = state.subjects.map(s => {
    const maxCIE       = getMaxCIE(s.type);
    const obtained     = calcCIE(s);
    const pending      = pendingCIEMax(s);
    const bestCIE      = Math.min(obtained + pending, maxCIE);
    const ciePct       = (obtained / maxCIE) * 100;
    const cieScaled    = (obtained / maxCIE) * 50;
    const bestCIEScld  = (bestCIE / maxCIE) * 50;
    const tg           = getGradeByName(s.targetGrade);

    let finalPct = null, grade = null, pts = null, seeScaled = null;
    if (s.seeDone && s.see != null) {
      seeScaled = (s.see / 100) * 50;
      finalPct  = cieScaled + seeScaled;
      const g   = getGradeObj(finalPct);
      grade     = g.g; pts = g.pts;
    }

    const needSEEScaled = tg.min - bestCIEScld;
    const needSEEPct    = needSEEScaled * 2;

    /* AI Prediction Calculations */
    const predCIE = getPredictedCIE(s);
    const predCIEScld = (predCIE / maxCIE) * 50;
    const predCIEPct = (predCIE / maxCIE) * 100;
    
    let seePredPct = null;
    if (s.seeDone && s.see != null) {
      seePredPct = s.see;
    } else {
      seePredPct = predictSEE(predCIEPct);
    }
    const seePredScaled = (seePredPct / 100) * 50;
    const finalPctPred = predCIEScld + seePredScaled;
    const gPred = getGradeObj(finalPctPred);
    const predGrade = gPred.g;
    const predPts = gPred.pts;

    const needSEEScaledPred = tg.min - predCIEScld;
    const needSEEPctPred = needSEEScaledPred * 2;

    return { s, maxCIE, obtained, pending, bestCIE, ciePct, cieScaled,
             bestCIEScld, finalPct, grade, pts, seeScaled, tg, needSEEPct,
             predCIE, predCIEScld, predCIEPct, seePredPct, seePredScaled,
             finalPctPred, predGrade, predPts, needSEEPctPred };
  });

  /* SGPA calculation — mirrors C calcSGPA() + adviseSGPA() */
  let sumCP = 0, sumC = 0, pendingSubjs = 0;
  results.forEach(r => {
    if (r.s.seeDone && r.pts !== null) {
      sumCP += r.s.credits * r.pts;
      sumC  += r.s.credits;
    } else {
      pendingSubjs++;
    }
  });
  const totalCredits   = state.subjects.reduce((a, s) => a + s.credits, 0);
  const pendingCredits = totalCredits - sumC;
  const sgpaSoFar      = sumC > 0 ? sumCP / sumC : null;
  const neededGP       = pendingCredits > 0 ? (state.targetSGPA * totalCredits - sumCP) / pendingCredits : null;

  /* ── Build results HTML ── */
  let html = '';

  /* ── Student header ── */
  html += `<div class="card" style="margin-bottom:1rem">
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="width:48px;height:48px;border-radius:50%;background:var(--purple-lt);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--purple-tx);flex-shrink:0">
        ${state.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}
      </div>
      <div>
        <div style="font-size:18px;font-weight:700">${state.name}</div>
        <div style="font-size:13px;color:var(--text2)">${state.roll} &nbsp;·&nbsp; ${state.numSubj} subjects &nbsp;·&nbsp; ${totalCredits} total credits</div>
      </div>
    </div>
  </div>`;

  /* ── SGPA Summary ── */
  html += `<div class="grid4" style="margin-bottom:1rem">
    <div class="metric">
      <div class="metric-label">Target SGPA</div>
      <div class="metric-val" style="color:var(--purple)">${state.targetSGPA.toFixed(1)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">SGPA so far</div>
      <div class="metric-val" style="color:${sgpaSoFar!=null&&sgpaSoFar>=state.targetSGPA?'#1D9E75':'#BA7517'}">${sgpaSoFar!=null?sgpaSoFar.toFixed(2):'—'}</div>
    </div>
    <div class="metric">
      <div class="metric-label">SEE pending</div>
      <div class="metric-val">${pendingSubjs}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Total credits</div>
      <div class="metric-val">${totalCredits}</div>
    </div>
  </div>`;

  /* SGPA advice — mirrors C adviseSGPA() */
  if (pendingSubjs === 0) {
    if (sgpaSoFar >= state.targetSGPA)
      html += alertOk(`<strong>Congratulations!</strong> You achieved your target SGPA of ${state.targetSGPA.toFixed(1)}. Your final SGPA: <strong>${sgpaSoFar.toFixed(2)}</strong>`);
    else
      html += alertDanger(`Your final SGPA <strong>${sgpaSoFar.toFixed(2)}</strong> is below your target <strong>${state.targetSGPA.toFixed(1)}</strong>.`);
  } else if (neededGP !== null) {
    if (neededGP > 10) {
      const maxPossible = ((sumCP + pendingCredits * 10) / totalCredits).toFixed(2);
      html += alertDanger(`Target SGPA ${state.targetSGPA.toFixed(1)} is <strong>not achievable</strong>. Maximum possible: <strong>${maxPossible}</strong>`);
    } else if (neededGP <= 0) {
      html += alertOk(`Target SGPA ${state.targetSGPA.toFixed(1)} is achievable even with minimum scores in the ${pendingSubjs} pending subject(s).`);
    } else {
      const aimGrade = [...GRADES].reverse().find(g => g.pts >= Math.ceil(neededGP));
      html += alertInfo(`To hit SGPA <strong>${state.targetSGPA.toFixed(1)}</strong>, aim for <strong>${aimGrade ? aimGrade.g + ' (' + aimGrade.desc + ')' : 'O'}</strong> or better across your <strong>${pendingSubjs}</strong> pending subject(s). Average grade points needed: ${neededGP.toFixed(2)}`);
    }
  }

  /* ── Performance Chart Card ── */
  html += `<div class="card" style="margin-bottom:1.5rem">
    <div class="card-title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 20V10M12 20V4M6 20v-6"/>
      </svg>
      Performance vs Target Grade Marks
    </div>
    <div style="position: relative; height: 320px; width: 100%;">
      <canvas id="performanceChart"></canvas>
    </div>
  </div>`;

  /* ── Subject-wise results ── */
  html += `<div class="sec-label" style="margin-top:1.25rem">Subject-wise analysis</div>`;

  results.forEach(r => {
    const { s, maxCIE, obtained, ciePct, cieScaled, bestCIEScld, finalPct, grade, pts, needSEEPct, tg,
            predCIE, predCIEScld, predCIEPct, seePredPct, seePredScaled,
            finalPctPred, predGrade, predPts, needSEEPctPred } = r;
    const typeLbl = { theory:'Theory', theory_lab:'Theory+Lab', lab_only:'Lab only' }[s.type];
    const cieFillColor = ciePct >= 60 ? 'fill-green' : ciePct >= 40 ? 'fill-amber' : 'fill-red';

    html += `<div class="result-card">
      <div class="result-card-header">
        <div>
          <div class="result-subj-name">${s.name}</div>
          <div class="result-subj-meta">
            <span class="badge badge-purple">${typeLbl}</span>
            <span class="badge badge-teal">${s.credits} credit${s.credits>1?'s':''}</span>
            <span class="badge badge-amber">Target: ${s.targetGrade} (${tg.desc})</span>
          </div>
        </div>
        ${grade ? `<span class="pill" style="${gradePillStyle(grade)};font-size:15px;padding:4px 14px">${grade} &nbsp; ${pts} pts</span>` : `<span class="badge badge-amber" style="font-size:12px;padding:4px 10px">SEE pending</span>`}
      </div>`;

    /* CIE progress */
    html += progressBar(ciePct, cieFillColor,
      `CIE: ${obtained.toFixed(1)} / ${maxCIE} marks`,
      `${ciePct.toFixed(1)}% → scaled ${cieScaled.toFixed(1)} / 50`);

    if (ciePct < 40)
      html += alertDanger(`CIE is below the 40% passing standard! You need <strong>${(0.4*maxCIE - obtained).toFixed(1)}</strong> more marks in remaining CIE components.`);

    if (s.seeDone && s.see != null) {
      /* SEE done — show final result */
      const seePct = s.see;
      const seeFill = seePct >= 50 ? 'fill-green' : seePct >= 35 ? 'fill-amber' : 'fill-red';
      html += progressBar(seePct, seeFill,
        `SEE: ${s.see} / 100`,
        `Scaled ${((s.see/100)*50).toFixed(1)} / 50`);

      if (seePct < 35)
        html += alertDanger(`SEE is below the 35% passing standard!`);

      const finFill = finalPct >= 60 ? 'fill-purple' : finalPct >= 40 ? 'fill-amber' : 'fill-red';
      html += progressBar(finalPct, finFill,
        `Final score`,
        `${finalPct.toFixed(2)}% → ${grade}`);

      if (finalPct >= tg.min)
        html += alertOk(`Target grade <strong>${s.targetGrade}</strong> achieved! Final: <strong>${finalPct.toFixed(2)}%</strong>`);
      else
        html += alertWarn(`Below target ${s.targetGrade} (needs ${tg.min}%). Got ${finalPct.toFixed(2)}%. Difference: ${(tg.min - finalPct).toFixed(2)}%`);

    } else {
      /* SEE pending — advise what's needed (mirrors C adviseSubject) */
      html += `<div style="margin-top:12px;background:var(--surface2);border-radius:var(--radius-md);padding:14px">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text2)">
          To achieve target grade ${s.targetGrade} (${tg.desc}, ≥ ${tg.min}%) — SEE is 50% of final score:
        </div>
        
        <div class="grid2" style="margin-bottom:12px">
          <!-- Optimistic card -->
          <div style="background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius-md);padding:10px">
            <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase">Optimistic (Best Case CIE)</div>
            <div style="font-size:13px;color:var(--text2);margin:4px 0">Assumes full marks in pending CIE</div>
            <div style="font-size:16px;font-weight:700;color:var(--blue);margin:4px 0">Best CIE: ${bestCIEScld.toFixed(1)} / 50</div>
            ${needSEEPct <= 0 ? 
              `<div style="font-size:12px;font-weight:600;color:var(--green)">0% in SEE needed</div>` :
              needSEEPct > 100 ? 
              `<div style="font-size:12px;font-weight:600;color:var(--red)">NOT Achievable</div>` :
              `<div style="font-size:12px;font-weight:600;color:var(--text)">Min SEE needed: <strong style="font-size:14px">${Math.ceil(needSEEPct)}%</strong></div>`
            }
          </div>
          <!-- Realistic card -->
          <div style="background:var(--sgpa-grad);border:0.5px solid var(--sgpa-border);border-radius:var(--radius-md);padding:10px">
            <div style="font-size:11px;font-weight:600;color:var(--purple-tx);text-transform:uppercase">Realistic (AI Predicted CIE)</div>
            <div style="font-size:13px;color:var(--text2);margin:4px 0">Predicts pending CIE using AI</div>
            <div style="font-size:16px;font-weight:700;color:var(--purple);margin:4px 0">Predicted CIE: ${predCIEScld.toFixed(1)} / 50</div>
            ${needSEEPctPred <= 0 ? 
              `<div style="font-size:12px;font-weight:600;color:var(--green)">0% in SEE needed</div>` :
              needSEEPctPred > 100 ? 
              `<div style="font-size:12px;font-weight:600;color:var(--red)">NOT Achievable</div>` :
              `<div style="font-size:12px;font-weight:600;color:var(--text)">Min SEE needed: <strong style="font-size:14px">${Math.ceil(needSEEPctPred)}%</strong></div>`
            }
          </div>
        </div>
        
        <!-- AI prediction box -->
        <div style="background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius-md);padding:10px;margin-bottom:12px">
          <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;margin-bottom:6px">AI Forecast Estimates</div>
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <div>
              <span style="font-size:12px;color:var(--text2)">Predicted SEE:</span>
              <strong style="font-size:13px;color:var(--purple)">${seePredPct.toFixed(1)}%</strong>
            </div>
            <div>
              <span style="font-size:12px;color:var(--text2)">Predicted Final Score:</span>
              <strong style="font-size:13px;color:var(--purple)">${finalPctPred.toFixed(2)}%</strong>
            </div>
            <div>
              <span style="font-size:12px;color:var(--text2)">Predicted Grade:</span>
              <span class="pill" style="${gradePillStyle(predGrade)};font-size:11px;padding:1px 6px">${predGrade}</span>
            </div>
          </div>
        </div>`;

      if (ciePct < 40) {
        html += alertDanger(`Your CIE (${ciePct.toFixed(1)}%) is below the 40% CIE passing standard. Boost remaining CIE first.`);
      }

      /* Pending component targets */
      let pendingItems = [];
      if (s.type !== 'lab_only') {
        if (!s.q1done) pendingItems.push('Quiz 1 — score full 10 / 10');
        if (!s.q2done) pendingItems.push('Quiz 2 — score full 10 / 10');
        if (!s.t1done) pendingItems.push('Test 1 — score as high as possible (out of 50)');
        if (!s.t2done) pendingItems.push('Test 2 — score as high as possible (out of 50)');
        if (!s.expdone) pendingItems.push('Experiential learning — score full 40 / 40');
      }
      if (s.type === 'theory_lab') {
        if (!s.labExDone)   pendingItems.push('Lab exercises — score full 40 / 40');
        if (!s.labTestDone) pendingItems.push('Lab test — score full 10 / 10');
      }
      if (s.type === 'lab_only') {
        if (!s.labExDone)   pendingItems.push('Lab exercises — score full 30 / 30');
        if (!s.labTestDone) pendingItems.push('Lab test — score full 10 / 10');
        if (!s.innovDone)   pendingItems.push('Innovative experiment — score full 10 / 10');
      }
      if (pendingItems.length) {
        html += `<div style="margin-top:8px">
          <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:4px">Pending CIE targets (to maximise your CIE score):</div>
          <ul class="pending-list">${pendingItems.map(p=>`<li>${p}</li>`).join('')}</ul>
        </div>`;
      }
      html += `</div>`;
    }

    html += `</div>`; /* /result-card */
  });

  /* ── SGPA detailed breakdown ── */
  html += `<div class="sec-label" style="margin-top:1rem">SGPA calculation breakdown</div>
  <div class="card">
    <table class="grade-table">
      <thead><tr><th>Subject</th><th>Credits</th><th>CIE %</th><th>Final %</th><th>Grade</th><th>Grade pts</th><th>C × GP</th></tr></thead>
      <tbody>`;
  let gpTotal = 0, cTotal = 0;
  results.forEach(r => {
    const ciePct = (r.obtained / r.maxCIE * 100).toFixed(1);
    const fp = r.finalPct != null ? r.finalPct.toFixed(2)+'%' : '—';
    const grd = r.grade || '—';
    const gpts = r.pts != null ? r.pts : '—';
    const cgp  = (r.pts != null) ? (r.s.credits * r.pts).toFixed(0) : '—';
    if (r.pts != null) { gpTotal += r.s.credits * r.pts; cTotal += r.s.credits; }
    html += `<tr>
      <td>${r.s.name}</td>
      <td>${r.s.credits}</td>
      <td>${ciePct}%</td>
      <td>${fp}</td>
      <td>${grd !== '—' ? `<span class="pill" style="${gradePillStyle(grd)};font-size:11px;padding:1px 8px">${grd}</span>` : '—'}</td>
      <td>${gpts}</td>
      <td><strong>${cgp}</strong></td>
    </tr>`;
  });
  html += `</tbody><tfoot><tr style="background:var(--surface2);font-weight:600">
    <td colspan="2">Total / SGPA</td><td>—</td><td>—</td><td>—</td>
    <td>Σ Credits: ${cTotal}</td>
    <td>${cTotal > 0 ? (gpTotal/cTotal).toFixed(2) : '—'}</td>
  </tr></tfoot></table>
  <p style="font-size:12px;color:var(--text3);margin-top:8px">SGPA = Σ(Credits × Grade Points) / Σ Credits = ${gpTotal} / ${cTotal} = <strong>${cTotal>0?(gpTotal/cTotal).toFixed(2):'—'}</strong></p>
  </div>`;

  /* ── Grade reference table (result page) ── */
  html += `<div class="sec-label">Grade scale (Table 4.3)</div>
  <div class="card">
    <table class="grade-table">
      <thead><tr><th>Grade</th><th>Description</th><th>% Range</th><th>Grade Points</th></tr></thead>
      <tbody>${GRADES.map(g=>`<tr>
        <td><span class="pill" style="${gradePillStyle(g.g)};font-size:12px;padding:2px 10px">${g.g}</span></td>
        <td>${g.desc}</td><td>${g.min} – ${g.max}%</td><td style="font-weight:600">${g.pts}</td>
      </tr>`).join('')}</tbody>
    </table>
    <p style="font-size:11px;color:var(--text3);margin-top:8px">Passing standard: CIE ≥ 40% AND SEE ≥ 35% AND Aggregate ≥ 40%</p>
  </div>`;

  document.getElementById('resultsPanel').innerHTML = html;
  renderChart(results);
  goToStep(3);
}
// ── Chart Rendering Logic ──
let performanceChartInstance = null;

function renderChart(results) {
  const ctx = document.getElementById('performanceChart');
  if (!ctx) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const labels = results.map(r => r.s.name);
  const cieData = results.map(r => r.s.seeDone && r.see != null ? r.cieScaled : r.predCIEScld);
  const seeData = results.map(r => r.s.seeDone && r.see != null ? r.seeScaled : r.seePredScaled);
  const targetData = results.map(r => r.tg.min);

  if (performanceChartInstance) {
    performanceChartInstance.destroy();
  }

  performanceChartInstance = new Chart(ctx, {
    data: {
      labels: labels,
      datasets: [
        {
          type: 'line',
          label: 'Target Marks (to hit Grade)',
          data: targetData,
          borderColor: isDark ? '#F59E0B' : '#BA7517',
          borderWidth: 2,
          borderDash: [6, 4],
          fill: false,
          pointBackgroundColor: isDark ? '#F59E0B' : '#BA7517',
          pointBorderColor: isDark ? '#17171c' : '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          order: 1
        },
        {
          type: 'bar',
          label: 'CIE (Scaled to 50)',
          data: cieData,
          backgroundColor: isDark ? 'rgba(129, 117, 245, 0.8)' : 'rgba(83, 74, 183, 0.7)',
          borderColor: isDark ? '#8175f5' : '#534AB7',
          borderWidth: 1,
          stack: 'score',
          order: 2
        },
        {
          type: 'bar',
          label: 'SEE (Scaled/Predicted, Max 50)',
          data: seeData,
          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.8)' : 'rgba(24, 95, 165, 0.7)',
          borderColor: isDark ? '#3b82f6' : '#185FA5',
          borderWidth: 1,
          stack: 'score',
          order: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          grid: {
            color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'
          },
          ticks: {
            color: isDark ? '#a0a0ab' : '#555450',
            font: {
              family: "'Segoe UI', system-ui, sans-serif",
              weight: '500'
            }
          }
        },
        y: {
          stacked: true,
          max: 100,
          min: 0,
          grid: {
            color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'
          },
          ticks: {
            color: isDark ? '#a0a0ab' : '#555450',
            stepSize: 10,
            font: {
              family: "'Segoe UI', system-ui, sans-serif"
            }
          }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: isDark ? '#f3f3f7' : '#1a1a1a',
            font: {
              family: "'Segoe UI', system-ui, sans-serif",
              weight: '500'
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += context.parsed.y.toFixed(1) + ' marks';
              }
              return label;
            }
          }
        }
      }
    }
  });
}

function updateChartColors() {
  if (performanceChartInstance) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    // Update grid lines
    performanceChartInstance.options.scales.x.grid.color = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
    performanceChartInstance.options.scales.y.grid.color = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
    
    // Update ticks
    performanceChartInstance.options.scales.x.ticks.color = isDark ? '#a0a0ab' : '#555450';
    performanceChartInstance.options.scales.y.ticks.color = isDark ? '#a0a0ab' : '#555450';
    
    // Update datasets
    const datasets = performanceChartInstance.data.datasets;
    if (datasets.length === 3) {
      datasets[0].borderColor = isDark ? '#F59E0B' : '#BA7517';
      datasets[0].pointBackgroundColor = isDark ? '#F59E0B' : '#BA7517';
      datasets[0].pointBorderColor = isDark ? '#17171c' : '#ffffff';
      
      datasets[1].backgroundColor = isDark ? 'rgba(129, 117, 245, 0.8)' : 'rgba(83, 74, 183, 0.7)';
      datasets[1].borderColor = isDark ? '#8175f5' : '#534AB7';
      
      datasets[2].backgroundColor = isDark ? 'rgba(59, 130, 246, 0.8)' : 'rgba(24, 95, 165, 0.7)';
      datasets[2].borderColor = isDark ? '#3b82f6' : '#185FA5';
    }
    
    if (performanceChartInstance.options.plugins && performanceChartInstance.options.plugins.legend) {
      performanceChartInstance.options.plugins.legend.labels.color = isDark ? '#f3f3f7' : '#1a1a1a';
    }
    
    performanceChartInstance.update();
  }
}
