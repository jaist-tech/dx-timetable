// Admin tool frontend
//
// Flow:
//   1. PDF drop / select  -> POST /api/parse
//   2. Show meta form + schedule preview (editable)
//   3. Check button       -> client-side validation + server-side dup check
//   4. Commit button      -> POST /api/commit

let parsedResult = null;     // { segment, kind, meta, routes } from server
let manifest = null;         // cached manifest
let checkPassed = false;

const SEGMENTS = [
  { id: 'shuttle_tsurugi', label: 'JAISTシャトル 鶴来線' },
  { id: 'shuttle_komatsu', label: 'JAISTシャトル 小松線' },
  { id: 'ishikawa_line',   label: '北陸鉄道 石川線' },
  { id: 'ir_ishikawa',     label: 'IRいしかわ鉄道' },
  { id: 'limo_komatsu',    label: '小松空港連絡バス' },
];

// 特別ダイヤ (special) を新規追加できる区間。
// JAIST シャトル (鶴来線・小松線) のみ対応。他は parser 未実装のため UI で弾く。
const SPECIAL_SUPPORTED_SEGMENTS = ['shuttle_tsurugi', 'shuttle_komatsu'];

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const uploadStatus = document.getElementById('upload-status');

function showStatus(msg, isError = false) {
  uploadStatus.textContent = msg;
  uploadStatus.style.color = isError ? '#c62828' : '#666';
}

['dragenter', 'dragover'].forEach(ev => {
  dropzone.addEventListener(ev, e => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach(ev => {
  dropzone.addEventListener(ev, e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});
dropzone.addEventListener('drop', e => {
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});
fileInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) handleFile(f);
});

async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showStatus('PDFファイルを選んでください', true);
    return;
  }
  showStatus(`アップロード中: ${file.name} (${file.size.toLocaleString()} bytes)`);
  const fd = new FormData();
  fd.append('pdf', file);
  try {
    const res = await fetch('/api/parse', { method: 'POST', body: fd });
    const json = await res.json();
    if (json.error) {
      // Allow user to retry with hints
      showStatus('パースエラー: ' + json.error, true);
      // If we got at least guesses, let the user manually pick segment/kind and retry
      if (json.segment_guess !== undefined) {
        showRetryForm(file, json.segment_guess, json.kind_guess);
      }
      return;
    }
    parsedResult = json.result;
    showStatus(`パース成功: ${file.name} (推定: ${json.segment_guess} / ${json.kind_guess})`);
    showPreview();
  } catch (e) {
    showStatus('通信エラー: ' + e.message, true);
  }
}

function showRetryForm(file, segGuess, kindGuess) {
  const div = document.createElement('div');
  div.className = 'retry-form';

  function buildSegOptions(currentKind, currentSeg) {
    return SEGMENTS.map(s => {
      const dis = (currentKind === 'special' && !SPECIAL_SUPPORTED_SEGMENTS.includes(s.id)) ? ' disabled' : '';
      const sel = s.id === currentSeg ? ' selected' : '';
      const note = dis ? ' (特別ダイヤ未対応)' : '';
      return `<option value="${s.id}"${sel}${dis}>${s.label}${note}</option>`;
    }).join('');
  }

  div.innerHTML = `
    <p>区間または種別を指定して再試行してください:</p>
    <label>種別:
      <label><input type="radio" name="retry-kind" value="regular" ${kindGuess === 'regular' ? 'checked' : ''}> 通常</label>
      <label><input type="radio" name="retry-kind" value="special" ${kindGuess === 'special' ? 'checked' : ''}> 特別</label>
    </label>
    <label>区間: <select id="retry-seg">${buildSegOptions(kindGuess, segGuess)}</select></label>
    <p class="hint">特別ダイヤは JAIST シャトル (鶴来線・小松線) のみ追加可能。</p>
    <button id="retry-btn">再試行</button>
  `;
  uploadStatus.appendChild(div);

  // 種別変更時に区間オプションを再ビルド (special選択で非対応区間を弾く)
  div.querySelectorAll('input[name="retry-kind"]').forEach(el => {
    el.addEventListener('change', () => {
      const k = document.querySelector('input[name="retry-kind"]:checked').value;
      const currentSeg = document.getElementById('retry-seg').value;
      const fallbackSeg = (k === 'special' && !SPECIAL_SUPPORTED_SEGMENTS.includes(currentSeg))
        ? SPECIAL_SUPPORTED_SEGMENTS[0]
        : currentSeg;
      document.getElementById('retry-seg').innerHTML = buildSegOptions(k, fallbackSeg);
    });
  });

  document.getElementById('retry-btn').addEventListener('click', async () => {
    const seg = document.getElementById('retry-seg').value;
    const kind = document.querySelector('input[name="retry-kind"]:checked').value;
    const fd = new FormData();
    fd.append('pdf', file);
    fd.append('segment', seg);
    fd.append('kind', kind);
    try {
      const res = await fetch('/api/parse', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.error) {
        showStatus('再パースもエラー: ' + json.error, true);
        return;
      }
      div.remove();
      parsedResult = json.result;
      showStatus(`パース成功: ${file.name} (${seg} / ${kind})`);
      showPreview();
    } catch (e) {
      showStatus('通信エラー: ' + e.message, true);
    }
  });
}

function showPreview() {
  document.getElementById('step-preview').classList.remove('hidden');
  renderDerivedNotice();
  renderMetaForm();
  renderSchedulePreview();
  document.getElementById('step-check').classList.remove('hidden');
  // hide commit until check passes
  document.getElementById('step-commit').classList.add('hidden');
  document.getElementById('btn-commit').disabled = true;
  document.getElementById('check-result').innerHTML = '';
  checkPassed = false;
}

function renderDerivedNotice() {
  // 既存の通知があれば消す
  const existing = document.getElementById('derived-notice');
  if (existing) existing.remove();

  const derived = parsedResult && parsedResult.meta && parsedResult.meta.derived_fields;
  if (!derived || derived.length === 0) return;

  const notice = document.createElement('div');
  notice.id = 'derived-notice';
  notice.className = 'derived-notice';
  let html = '<strong>⚠️ PDF外のデータを推定で補完しています</strong><ul>';
  derived.forEach(d => {
    html += `<li><code>${escapeHtml(d.field)}</code>: ${escapeHtml(d.description)}<br><span class="hint">${escapeHtml(d.reason)}</span></li>`;
  });
  html += '</ul>';
  notice.innerHTML = html;

  // メタフォームの直前に挿入
  const preview = document.getElementById('step-preview');
  const metaForm = document.getElementById('meta-form');
  preview.insertBefore(notice, metaForm);
}

function renderMetaForm() {
  const r = parsedResult;
  const isSpecial = r.kind === 'special';
  const m = r.meta || {};
  const segLabel = (SEGMENTS.find(s => s.id === r.segment) || {}).label || r.segment;

  // Build editable form
  const form = document.getElementById('meta-form');
  form.innerHTML = '';

  function field(labelHtml, inputHtml, hint) {
    const labelEl = document.createElement('label');
    labelEl.innerHTML = labelHtml;
    const wrap = document.createElement('div');
    wrap.innerHTML = inputHtml + (hint ? `<span class="hint">${hint}</span>` : '');
    form.appendChild(labelEl);
    form.appendChild(wrap);
  }

  function lab(jp, key, required) {
    const star = required ? ' <span class="req">*</span>' : '';
    return `${jp}<br><span class="key">(${key})</span>${star}`;
  }

  // Segment
  // special のとき非対応区間を disabled にする
  field(lab('区間', 'segment'),
    `<select id="f-segment">${
      SEGMENTS.map(s => {
        const disabledForSpecial = isSpecial && !SPECIAL_SUPPORTED_SEGMENTS.includes(s.id);
        const dis = disabledForSpecial ? ' disabled' : '';
        const sel = s.id === r.segment ? ' selected' : '';
        const note = disabledForSpecial ? ' (特別ダイヤ未対応)' : '';
        return `<option value="${s.id}"${sel}${dis}>${s.label}${note}</option>`;
      }).join('')
    }</select>`,
    isSpecial
      ? '特別ダイヤは JAIST シャトル (鶴来線・小松線) のみ対応。他区間は disabled。'
      : '自動推定の結果。違う場合は変更してください。'
  );

  // Kind
  field(lab('種別', 'kind'),
    `<label><input type="radio" name="f-kind" value="regular" ${!isSpecial ? 'checked' : ''}> 通常 (regular)</label>
     <label><input type="radio" name="f-kind" value="special" ${isSpecial ? 'checked' : ''}> 特別 (special)</label>`,
    '特別 (special) は JAIST シャトル (鶴来線・小松線) のみ追加可能'
  );

  // valid_from / valid_until
  if (!isSpecial) {
    field(lab('開始日', 'valid_from', true),
      `<input type="text" id="f-valid_from" value="${m.valid_from || ''}" placeholder="YYYY-MM-DD">`,
      '通常ダイヤの開始日 (必須)'
    );
    field(lab('終了日', 'valid_until'),
      `<input type="text" id="f-valid_until" value="${m.valid_until || ''}" placeholder="YYYY-MM-DD (空欄可)">`,
      '通常ダイヤの終了日 (空欄なら null = 終了未定)'
    );
  } else {
    const ap = m.apply_periods || [{ from: m.valid_from || '', until: m.valid_until || '' }];
    field(lab('適用期間', 'apply_periods', true),
      `<div id="f-apply-periods">${
        ap.map((p, i) => periodInputHtml(i, p)).join('')
      }</div>
       <button type="button" id="f-add-period" class="small-btn">+ 期間を追加</button>`,
      '実際に適用される日付範囲。飛び飛びなら複数追加'
    );
    field(lab('表示開始日', 'display_from'),
      `<input type="text" id="f-display_from" value="${m.display_from || ''}" placeholder="YYYY-MM-DD (空欄可)">`,
      'タブを表示し始める日 (空欄なら apply_periods の最初と同じ)'
    );
    field(lab('表示終了日', 'display_until'),
      `<input type="text" id="f-display_until" value="${m.display_until || ''}" placeholder="YYYY-MM-DD (空欄可)">`,
      'タブを消す日 (空欄なら apply_periods の最後と同じ)'
    );
    field(lab('識別キー', 'schedule_key', true),
      `<input type="text" id="f-schedule_key" value="${m.schedule_key || ''}" placeholder="例: gw_2026">`,
      '英数字とアンダースコア。route.schedules のキーになる'
    );
    field(lab('日本語ラベル', 'label_ja', true),
      `<input type="text" id="f-label_ja" value="${m.label_ja || ''}" placeholder="例: GW特別ダイヤ">`,
      'タブに表示する日本語ラベル'
    );
    field(lab('英語ラベル', 'label_en'),
      `<input type="text" id="f-label_en" value="${m.label_en || ''}" placeholder="例: Golden Week Special">`,
      'タブに表示する英語ラベル'
    );
  }

  // Common
  field(lab('運営者', 'operator'),
    `<input type="text" id="f-operator" value="${m.operator || ''}">`,
    null
  );
  field(lab('備考', 'note'),
    `<textarea id="f-note" rows="2">${m.note || ''}</textarea>`,
    null
  );
  field(lab('追加日時', 'added_at'),
    `<input type="text" id="f-added_at" value="(自動付与: 追加実行時の現在時刻)" disabled>`,
    null
  );

  // Wire up dynamic period buttons
  if (isSpecial) {
    const addBtn = document.getElementById('f-add-period');
    if (addBtn) addBtn.addEventListener('click', () => {
      const container = document.getElementById('f-apply-periods');
      const idx = container.children.length;
      container.insertAdjacentHTML('beforeend', periodInputHtml(idx, { from: '', until: '' }));
      attachPeriodHandlers();
    });
    attachPeriodHandlers();
  }

  // Wire up segment/kind change to re-render the form (so special<->regular toggles fields)
  document.getElementById('f-segment').addEventListener('change', e => {
    parsedResult.segment = e.target.value;
  });
  document.querySelectorAll('input[name="f-kind"]').forEach(el => {
    el.addEventListener('change', e => {
      captureFormToParsed();
      const newKind = e.target.value;
      // special に切替時、現在の区間が non-supported なら最初の supported に補正
      if (newKind === 'special' && !SPECIAL_SUPPORTED_SEGMENTS.includes(parsedResult.segment)) {
        parsedResult.segment = SPECIAL_SUPPORTED_SEGMENTS[0];
      }
      parsedResult.kind = newKind;
      renderMetaForm();
    });
  });
}

function periodInputHtml(idx, p) {
  return `<div class="period-row" data-idx="${idx}">
    <input type="text" class="p-from" value="${p.from || ''}" placeholder="YYYY-MM-DD">
    〜
    <input type="text" class="p-until" value="${p.until || ''}" placeholder="YYYY-MM-DD">
    <button type="button" class="p-remove small-btn">削除</button>
  </div>`;
}

function attachPeriodHandlers() {
  document.querySelectorAll('.p-remove').forEach(btn => {
    btn.onclick = () => btn.closest('.period-row').remove();
  });
}

function captureFormToParsed() {
  // Snapshot current form values into parsedResult.meta (keeps user's edits when re-rendering)
  if (!parsedResult) return;
  const m = parsedResult.meta || {};
  const isSpecial = parsedResult.kind === 'special';
  const get = id => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  if (isSpecial) {
    const periods = [];
    document.querySelectorAll('#f-apply-periods .period-row').forEach(row => {
      const from = row.querySelector('.p-from').value.trim();
      const until = row.querySelector('.p-until').value.trim();
      if (from || until) periods.push({ from, until });
    });
    if (periods.length > 0) m.apply_periods = periods;
    m.display_from = get('f-display_from') || null;
    m.display_until = get('f-display_until') || null;
    m.schedule_key = get('f-schedule_key');
    m.label_ja = get('f-label_ja');
    m.label_en = get('f-label_en') || null;
  } else {
    m.valid_from = get('f-valid_from') || null;
    m.valid_until = get('f-valid_until') || null;
  }
  m.operator = get('f-operator') || null;
  m.note = get('f-note') || null;
  parsedResult.meta = m;
}

function renderSchedulePreview() {
  const container = document.getElementById('schedule-preview');
  container.innerHTML = '';
  const r = parsedResult;
  if (!r.routes || r.routes.length === 0) {
    container.textContent = '(時刻表データなし)';
    return;
  }
  // 推定で埋めた停留所インデックスを抽出 (鶴来線中間6駅: idx 1..6)
  // routes[*].schedules.default[*][1..6] のような表現を雑に解釈
  const derivedStopIndices = new Set();
  const derived = r.meta && r.meta.derived_fields;
  if (Array.isArray(derived)) {
    derived.forEach(d => {
      const m = (d.field || '').match(/\[(\d+)\.\.(\d+)\]/);
      if (m) {
        const a = parseInt(m[1]), b = parseInt(m[2]);
        for (let i = a; i <= b; i++) derivedStopIndices.add(i);
      }
    });
  }

  r.routes.forEach(route => {
    const wrapper = document.createElement('div');
    wrapper.className = 'route-block';
    const h = document.createElement('h4');
    h.textContent = route.name || route.id;
    wrapper.appendChild(h);
    const stops = route.stops || [];
    Object.entries(route.schedules || {}).forEach(([dayType, trips]) => {
      const sub = document.createElement('div');
      sub.className = 'day-block';
      sub.innerHTML = `<strong>${dayType}</strong> (${trips.length}便)`;
      if (trips.length > 0) {
        const tbl = document.createElement('table');
        const thead = document.createElement('thead');
        const head = document.createElement('tr');
        let headHtml = '<th>便</th>';
        stops.forEach((s, si) => {
          const isDerived = derivedStopIndices.has(si);
          headHtml += `<th${isDerived ? ' class="derived-col" title="この列は推定値"' : ''}>${escapeHtml(s)}${isDerived ? '<br><span class="derived-mark">(推定)</span>' : ''}</th>`;
        });
        head.innerHTML = headHtml;
        thead.appendChild(head);
        tbl.appendChild(thead);
        const tbody = document.createElement('tbody');
        trips.forEach((trip, ti) => {
          const tr = document.createElement('tr');
          let html = `<td>${ti + 1}便</td>`;
          stops.forEach((_, si) => {
            const isDerived = derivedStopIndices.has(si);
            html += `<td${isDerived ? ' class="derived-cell"' : ''}>${trip[si] || '-'}</td>`;
          });
          tr.innerHTML = html;
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        sub.appendChild(tbl);
      }
      wrapper.appendChild(sub);
    });
    container.appendChild(wrapper);
  });
}

// Check button
document.getElementById('btn-check').addEventListener('click', async () => {
  captureFormToParsed();
  const out = document.getElementById('check-result');
  out.innerHTML = 'チェック中...';
  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedResult),
    });
    const json = await res.json();
    renderCheckResult(json);
    document.getElementById('step-commit').classList.remove('hidden');
    renderCommitPreview();
    // commit ボタン: errors が空ならpermit
    const ok = !json.errors || json.errors.length === 0;
    checkPassed = ok;
    document.getElementById('btn-commit').disabled = !ok;
  } catch (e) {
    out.innerHTML = '<span class="check-fail">通信エラー: ' + escapeHtml(e.message) + '</span>';
  }
});

function renderCheckResult(r) {
  const out = document.getElementById('check-result');
  const errN = (r.errors || []).length;
  const warnN = (r.warnings || []).length;
  const passN = (r.passes || []).length;

  // Summary banner
  let summary;
  if (errN > 0) {
    summary = `<div class="check-summary check-fail">
      <strong>❌ エラー ${errN} 件</strong>
      <span>下のエラー欄を確認し、メタデータを修正してから再度「チェック実行」を押してください。</span>
    </div>`;
  } else if (warnN > 0) {
    summary = `<div class="check-summary check-warn">
      <strong>⚠️ エラーなし、警告 ${warnN} 件</strong>
      <span>追加は可能ですが、警告内容を確認してください。</span>
    </div>`;
  } else {
    summary = `<div class="check-summary check-pass">
      <strong>✅ 全 ${passN} 項目 OK</strong>
      <span>「データを追加」ボタンで反映できます。</span>
    </div>`;
  }

  // Group all results by category
  const byCategory = {};
  function pushItem(category, level, item) {
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push({ level, ...item });
  }
  (r.errors || []).forEach(e => pushItem(e.category || 'その他', 'fail', e));
  (r.warnings || []).forEach(w => pushItem(w.category || 'その他', 'warn', w));
  (r.passes || []).forEach(p => pushItem(p.category || 'その他', 'pass', p));

  // Define a stable category order
  const categoryOrder = ['基本情報', '期間', 'メタデータ', '時刻表データ', '重複チェック', 'その他'];
  const sortedCats = Object.keys(byCategory).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  let groups = '';
  sortedCats.forEach(cat => {
    const items = byCategory[cat];
    const errs = items.filter(i => i.level === 'fail').length;
    const warns = items.filter(i => i.level === 'warn').length;
    let badge = '';
    if (errs > 0) badge = `<span class="cat-badge cat-fail">エラー ${errs}</span>`;
    else if (warns > 0) badge = `<span class="cat-badge cat-warn">警告 ${warns}</span>`;
    else badge = `<span class="cat-badge cat-pass">OK</span>`;

    let lines = '';
    items.forEach(it => {
      const icon = it.level === 'fail' ? '❌' : it.level === 'warn' ? '⚠️' : '✅';
      const cls = `check-${it.level === 'fail' ? 'fail' : it.level === 'warn' ? 'warn' : 'pass'}`;
      let html = `<div class="check-line ${cls}">
        <span class="check-icon">${icon}</span>
        <span class="check-msg">${escapeHtml(it.msg)}</span>
      </div>`;
      if (it.hint) {
        html += `<div class="check-hint">→ ${escapeHtml(it.hint)}</div>`;
      }
      lines += html;
    });

    groups += `<details class="check-group" ${errs + warns > 0 ? 'open' : ''}>
      <summary><strong>${escapeHtml(cat)}</strong> ${badge} (${items.length}項目)</summary>
      <div class="check-group-body">${lines}</div>
    </details>`;
  });

  out.innerHTML = summary + groups;
}

function renderCommitPreview() {
  const r = parsedResult;
  const m = r.meta;
  const dir = r.kind === 'special' ? 'special' : 'regular';
  let from, until;
  if (r.kind === 'special') {
    const ap = m.apply_periods || [];
    from = ap[0] && ap[0].from;
    until = ap[ap.length - 1] && ap[ap.length - 1].until;
  } else {
    from = m.valid_from;
    until = m.valid_until || 'null';
  }
  const fname = `${r.segment}_${from || '?'}_${until || 'null'}.json`;
  const path = `public/data/${dir}/${fname}`;
  const div = document.getElementById('commit-preview');
  div.innerHTML = `
    <p>書き込み先: <code>${path}</code></p>
    <p>manifest 更新: <code>${dir}.${r.segment}</code> に1エントリ追加</p>
    <details>
      <summary>ファイル中身を確認</summary>
      <pre>${escapeHtml(JSON.stringify({ meta: m, routes: r.routes }, null, 2))}</pre>
    </details>
  `;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

document.getElementById('btn-commit').addEventListener('click', async () => {
  if (!checkPassed) return;
  const out = document.getElementById('commit-result');
  out.innerHTML = '書き込み中...';
  try {
    const res = await fetch('/api/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedResult),
    });
    const json = await res.json();
    if (!res.ok) {
      out.innerHTML = '<span class="check-fail">エラー: ' + escapeHtml(json.error || res.statusText) + '</span>';
      if (json.check) {
        out.innerHTML += '<div>(チェック結果が不整合: 再チェックしてください)</div>';
      }
      return;
    }
    out.innerHTML = `
      <div class="check-pass"><strong>✅ 追加完了</strong></div>
      <div>書き込みファイル: <code>${escapeHtml(json.written.data_file)}</code></div>
      <div>manifest 更新: <code>${escapeHtml(json.written.manifest_file)}</code></div>
      <div class="hint" style="margin-top:8px">変更を本番に反映するには <code>git add</code> + <code>git commit</code> + <code>git push</code> してください。</div>
    `;
    // commit 後は再 commit 不可にする
    document.getElementById('btn-commit').disabled = true;
    // refresh manifest cache
    fetch('/api/manifest').then(r => r.json()).then(j => { manifest = j; });
  } catch (e) {
    out.innerHTML = '<span class="check-fail">通信エラー: ' + escapeHtml(e.message) + '</span>';
  }
});

// preload manifest
fetch('/api/manifest').then(r => r.json()).then(j => { manifest = j; });

// ===== Tab navigation =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.toggle('active', p.dataset.tab === tab);
    });
    if (tab === 'list') {
      loadFileList();
    }
  });
});

// ===== List tab =====
const SEGMENT_LABELS = {
  shuttle_tsurugi: 'JAISTシャトル 鶴来線',
  shuttle_komatsu: 'JAISTシャトル 小松線',
  ishikawa_line: '北陸鉄道 石川線',
  ir_ishikawa: 'IRいしかわ鉄道',
  limo_komatsu: '小松空港連絡バス',
};

let _filesCache = null;       // last /api/files response
let _selectedFileId = null;   // 'regular/<file>' or 'special/<file>'

async function loadFileList(force = false) {
  if (_filesCache && !force) {
    renderFileList();
    return;
  }
  const sidebar = document.getElementById('file-list');
  sidebar.innerHTML = '<p>読み込み中...</p>';
  try {
    const res = await fetch('/api/files');
    _filesCache = await res.json();
    buildSegmentFilter();
    renderFileList();
  } catch (e) {
    sidebar.innerHTML = '<p style="color:#c62828">読み込みエラー: ' + escapeHtml(e.message) + '</p>';
  }
}

function buildSegmentFilter() {
  const container = document.getElementById('filter-segments');
  if (!container) return;
  // 既にビルド済みなら状態を保つ
  if (container.children.length > 0) return;
  const segments = new Set();
  ['regular', 'special'].forEach(k => {
    (_filesCache[k] || []).forEach(f => segments.add(f.segment));
  });
  const sorted = [...segments].sort();
  container.innerHTML = sorted.map(s =>
    `<label><input type="checkbox" class="filter-segment" value="${escapeHtml(s)}" checked>
       ${escapeHtml(SEGMENT_LABELS[s] || s)} <span class="key">(${escapeHtml(s)})</span></label>`
  ).join('');
  container.querySelectorAll('input').forEach(el => el.addEventListener('change', renderFileList));
}

function getFilters() {
  const kinds = [...document.querySelectorAll('.filter-kind:checked')].map(el => el.value);
  const segments = [...document.querySelectorAll('.filter-segment:checked')].map(el => el.value);
  const validity = (document.querySelector('input[name="filter-validity"]:checked') || {}).value || 'all';
  return { kinds, segments, validity };
}

function todayStr() {
  const n = new Date();
  return n.getFullYear() + '-' +
    String(n.getMonth() + 1).padStart(2, '0') + '-' +
    String(n.getDate()).padStart(2, '0');
}

function fileValidity(item) {
  const today = todayStr();
  // regular
  if (item.kind === 'regular') {
    if (item.valid_from > today) return 'future';
    if (item.valid_until && item.valid_until < today) return 'expired';
    return 'active';
  }
  // special: based on apply_periods (use min/max)
  const ap = item.apply_periods || [];
  if (!ap.length) return 'active';
  const minFrom = ap.reduce((a, b) => a.from < b.from ? a : b).from;
  const maxUntil = ap.reduce((a, b) => a.until > b.until ? a : b).until;
  if (minFrom > today) return 'future';
  if (maxUntil < today) return 'expired';
  return 'active';
}

function renderFileList() {
  const { kinds, segments, validity } = getFilters();
  const sidebar = document.getElementById('file-list');
  if (!_filesCache) return;
  const allItems = [];
  let ghostCount = 0;
  ['regular', 'special'].forEach(k => {
    if (!kinds.includes(k)) return;
    (_filesCache[k] || []).forEach(item => {
      if (segments.length > 0 && !segments.includes(item.segment)) return;
      if (item.ghost) ghostCount++;
      const v = fileValidity(item);
      if (validity !== 'all' && v !== validity) return;
      allItems.push({ ...item, _validity: v });
    });
  });
  if (ghostCount > 0) {
    const ghostBanner = `<div class="ghost-banner">⚠️ 実体ファイルが存在しないエントリが ${ghostCount} 件あります。詳細を開いて「削除 (manifest からも除去)」してください。</div>`;
    // 既存リストの先頭に表示する
    sidebar.innerHTML = ghostBanner;
  } else {
    sidebar.innerHTML = '';
  }

  if (allItems.length === 0) {
    sidebar.innerHTML += '<p class="placeholder">該当ファイルなし</p>';
    return;
  }

  // Group by kind
  const byKind = { regular: [], special: [] };
  allItems.forEach(it => byKind[it.kind].push(it));

  let html = sidebar.innerHTML;  // ghost banner があれば残す
  ['regular', 'special'].forEach(k => {
    if (byKind[k].length === 0) return;
    const kindLabel = k === 'regular' ? '通常 (regular)' : '特別 (special)';
    html += `<div class="file-kind-group">
      <h4>${kindLabel}</h4>
      <ul>`;
    // Sort: by segment then by valid_from
    byKind[k].sort((a, b) => {
      if (a.segment !== b.segment) return a.segment.localeCompare(b.segment);
      const af = a.valid_from || (a.apply_periods && a.apply_periods[0]?.from) || '';
      const bf = b.valid_from || (b.apply_periods && b.apply_periods[0]?.from) || '';
      return af.localeCompare(bf);
    });
    byKind[k].forEach(item => {
      const id = `${item.kind}/${item.file}`;
      const sel = id === _selectedFileId ? ' selected' : '';
      const validityClass = `validity-${item._validity}`;
      const ghostClass = item.ghost ? ' file-ghost' : '';
      let periodLabel;
      if (k === 'regular') {
        periodLabel = `${item.valid_from} 〜 ${item.valid_until || '(終了未定)'}`;
      } else {
        const ap = item.apply_periods || [];
        if (ap.length === 1) periodLabel = `${ap[0].from} 〜 ${ap[0].until}`;
        else if (ap.length > 1) periodLabel = `${ap[0].from} 〜 ${ap[ap.length - 1].until} (${ap.length}期間)`;
        else periodLabel = '?';
      }
      const labelExtra = k === 'special' && item.label_ja ? ` <span class="file-label">${escapeHtml(item.label_ja)}</span>` : '';
      const ghostBadge = item.ghost ? ' <span class="ghost-badge">ファイル無し</span>' : '';
      html += `<li class="file-item ${validityClass}${ghostClass}${sel}" data-id="${escapeHtml(id)}" data-kind="${k}" data-file="${escapeHtml(item.file)}" data-ghost="${item.ghost ? '1' : '0'}">
        <div class="file-segment">${escapeHtml(SEGMENT_LABELS[item.segment] || item.segment)}${labelExtra}${ghostBadge}</div>
        <div class="file-period">${escapeHtml(periodLabel)}</div>
        <div class="file-name"><code>${escapeHtml(item.file)}</code></div>
      </li>`;
    });
    html += `</ul></div>`;
  });
  sidebar.innerHTML = html;

  sidebar.querySelectorAll('.file-item').forEach(el => {
    el.addEventListener('click', () => {
      _selectedFileId = el.dataset.id;
      sidebar.querySelectorAll('.file-item').forEach(o => o.classList.toggle('selected', o === el));
      const isGhost = el.dataset.ghost === '1';
      if (isGhost) {
        renderGhostDetail(el.dataset.kind, el.dataset.file);
      } else {
        loadFileDetail(el.dataset.kind, el.dataset.file);
      }
    });
  });
}

function renderGhostDetail(kind, file) {
  const detail = document.getElementById('file-detail');
  detail.innerHTML = `
    <div class="detail-header">
      <div class="detail-path"><code>public/data/${escapeHtml(kind)}/${escapeHtml(file)}</code></div>
      <div class="detail-kind">⚠️ <strong>ファイル無し（ゴーストエントリ）</strong></div>
    </div>
    <div class="ghost-notice">
      <p>このエントリは manifest.json に登録されていますが、実体ファイルが存在しません。
         手動でファイルを削除した場合などに発生します。</p>
      <p>manifest からエントリを除去するには、下のボタンを押してください。</p>
      <button id="btn-delete-ghost" class="btn-danger">manifest から除去</button>
    </div>
  `;
  document.getElementById('btn-delete-ghost').addEventListener('click', async () => {
    if (!confirm(`${kind}/${file} を manifest から除去します。よろしいですか？`)) return;
    await callDeleteApi(kind, file);
  });
}

// Filter checkbox listeners
document.querySelectorAll('.filter-kind, input[name="filter-validity"]').forEach(el => {
  el.addEventListener('change', renderFileList);
});
document.getElementById('btn-refresh-list').addEventListener('click', () => loadFileList(true));

async function loadFileDetail(kind, file) {
  const detail = document.getElementById('file-detail');
  detail.innerHTML = '<p>読み込み中...</p>';
  try {
    const res = await fetch(`/api/file?kind=${encodeURIComponent(kind)}&file=${encodeURIComponent(file)}`);
    const doc = await res.json();
    if (doc.error) {
      detail.innerHTML = '<p style="color:#c62828">エラー: ' + escapeHtml(doc.error) + '</p>';
      return;
    }
    renderFileDetail(kind, file, doc);
  } catch (e) {
    detail.innerHTML = '<p style="color:#c62828">通信エラー: ' + escapeHtml(e.message) + '</p>';
  }
}

async function callDeleteApi(kind, file) {
  try {
    const res = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, file }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert('削除エラー: ' + (json.error || res.statusText));
      return;
    }
    alert(`削除しました\nファイル削除: ${json.removed.file_removed ? 'はい' : 'いいえ (元から無し)'}\nmanifest除去: ${json.removed.manifest_removed ? 'はい' : 'いいえ'}`);
    _selectedFileId = null;
    document.getElementById('file-detail').innerHTML = '<p class="placeholder">左のリストからファイルを選択してください</p>';
    loadFileList(true);
  } catch (e) {
    alert('通信エラー: ' + e.message);
  }
}

function renderFileDetail(kind, file, doc) {
  const detail = document.getElementById('file-detail');
  const meta = doc.meta || {};
  // Build meta summary
  const rows = [];
  if (kind === 'regular') {
    rows.push(['valid_from (開始日)', meta.valid_from || '-']);
    rows.push(['valid_until (終了日)', meta.valid_until === null || meta.valid_until === undefined ? '(なし / 終了未定)' : meta.valid_until]);
  } else {
    const ap = meta.apply_periods || [];
    rows.push(['apply_periods (適用期間)',
      ap.map(p => `${p.from} 〜 ${p.until}`).join('<br>') || '-']);
    rows.push(['display_from (表示開始日)', meta.display_from || '(=apply_periodsの最初)']);
    rows.push(['display_until (表示終了日)', meta.display_until || '(=apply_periodsの最後)']);
    rows.push(['schedule_key (識別キー)', meta.schedule_key || '-']);
    rows.push(['label_ja (日本語ラベル)', meta.label_ja || '-']);
    rows.push(['label_en (英語ラベル)', meta.label_en || '-']);
  }
  rows.push(['operator (運営者)', meta.operator || '-']);
  rows.push(['note (備考)', meta.note || '-']);
  rows.push(['added_at (追加日時)', meta.added_at || '(未記録)']);
  if (meta.updated_at) {
    rows.push(['updated_at (最終更新日時)', meta.updated_at]);
  }

  // Derived fields notice
  let derivedHtml = '';
  if (Array.isArray(meta.derived_fields) && meta.derived_fields.length > 0) {
    let ul = '<ul>';
    meta.derived_fields.forEach(d => {
      ul += `<li><code>${escapeHtml(d.field)}</code>: ${escapeHtml(d.description)}<br><span class="hint">${escapeHtml(d.reason)}</span></li>`;
    });
    ul += '</ul>';
    derivedHtml = `<div class="derived-notice"><strong>⚠️ PDF外のデータを推定で補完しています</strong>${ul}</div>`;
  }

  // Schedule preview (reuse parsedResult-style structure)
  const tempParsed = {
    segment: '?',
    kind: kind,
    meta: meta,
    routes: doc.routes || [],
  };

  detail.innerHTML = `
    <div class="detail-header">
      <div class="detail-path"><code>public/data/${escapeHtml(kind)}/${escapeHtml(file)}</code></div>
      <div class="detail-kind">種別: ${escapeHtml(kind)}</div>
      <div class="detail-actions">
        <button id="btn-edit" class="small-btn">編集</button>
        <button id="btn-delete" class="small-btn btn-danger">削除</button>
      </div>
    </div>
    ${derivedHtml}
    <h3>メタデータ</h3>
    <table class="meta-table">
      <tbody>
        ${rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${v}</td></tr>`).join('')}
      </tbody>
    </table>

    <h3>時刻表プレビュー</h3>
    <div id="detail-schedule-preview"></div>

    <details class="raw-json">
      <summary>生 JSON を表示</summary>
      <pre>${escapeHtml(JSON.stringify(doc, null, 2))}</pre>
    </details>
  `;

  const newContainer = document.getElementById('detail-schedule-preview');
  renderScheduleInto(newContainer, tempParsed);

  // 削除ボタン
  document.getElementById('btn-delete').addEventListener('click', () => {
    confirmDelete(kind, file, doc);
  });
  // 編集ボタン
  document.getElementById('btn-edit').addEventListener('click', () => {
    enterEditMode(kind, file, doc);
  });
}

function confirmDelete(kind, file, doc) {
  const meta = doc.meta || {};
  let scopeMsg;
  if (kind === 'special') {
    const ap = meta.apply_periods || [];
    const periods = ap.map(p => `${p.from}〜${p.until}`).join(', ');
    scopeMsg = `特別ダイヤ: ${meta.label_ja || meta.schedule_key || '(無名)'}\n適用期間: ${periods}`;
  } else {
    scopeMsg = `通常ダイヤ\n期間: ${meta.valid_from} 〜 ${meta.valid_until || '(終了未定)'}`;
  }
  if (!confirm(`以下のファイルを削除します:\n\n${kind}/${file}\n\n${scopeMsg}\n\nこの操作は取り消せません。よろしいですか？`)) {
    return;
  }
  callDeleteApi(kind, file);
}

// ===== 編集モード =====
function enterEditMode(kind, file, doc) {
  const detail = document.getElementById('file-detail');
  const meta = doc.meta || {};

  // 編集可フィールドの入力欄を作る
  function fmtPeriods(ap) {
    if (!Array.isArray(ap) || ap.length === 0) return '';
    return ap.map(p => `${p.from || ''} 〜 ${p.until || ''}`).join('\n');
  }

  let formHtml = `
    <div class="detail-header">
      <div class="detail-path"><code>public/data/${escapeHtml(kind)}/${escapeHtml(file)}</code></div>
      <div class="detail-kind">編集モード (種別: ${escapeHtml(kind)})</div>
    </div>
    <div class="edit-notice">
      <strong>編集できないフィールド:</strong> schedule_key, segment, added_at, 時刻表本体 (routes/schedules)<br>
      これらを変更するには、削除して新規追加してください。
    </div>
    <table class="meta-table">
      <tbody>
  `;

  function row(label, key, inputHtml, hint) {
    formHtml += `<tr><th>${escapeHtml(label)} <code class="hint">(${key})</code></th><td>${inputHtml}${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ''}</td></tr>`;
  }

  if (kind === 'regular') {
    row('開始日', 'valid_from',
      `<input type="text" id="ef-valid_from" value="${escapeHtml(meta.valid_from || '')}" placeholder="YYYY-MM-DD">`,
      'YYYY-MM-DD');
    row('終了日', 'valid_until',
      `<input type="text" id="ef-valid_until" value="${escapeHtml(meta.valid_until || '')}" placeholder="YYYY-MM-DD or empty">`,
      '空欄なら null (終了未定)');
  } else {
    const ap = meta.apply_periods || [];
    let periodsHtml = '<div id="ef-apply-periods">';
    ap.forEach((p, i) => {
      periodsHtml += `<div class="period-row">
        <input type="text" class="ef-p-from" value="${escapeHtml(p.from || '')}" placeholder="YYYY-MM-DD">
        〜
        <input type="text" class="ef-p-until" value="${escapeHtml(p.until || '')}" placeholder="YYYY-MM-DD">
        <button type="button" class="ef-p-remove small-btn">削除</button>
      </div>`;
    });
    periodsHtml += '</div><button type="button" id="ef-add-period" class="small-btn">+ 期間を追加</button>';
    row('適用期間', 'apply_periods', periodsHtml);
    row('表示開始日', 'display_from',
      `<input type="text" id="ef-display_from" value="${escapeHtml(meta.display_from || '')}" placeholder="YYYY-MM-DD">`,
      '空欄なら apply_periods の最初と同じ');
    row('表示終了日', 'display_until',
      `<input type="text" id="ef-display_until" value="${escapeHtml(meta.display_until || '')}" placeholder="YYYY-MM-DD">`,
      '空欄なら apply_periods の最後と同じ');
    row('日本語ラベル', 'label_ja',
      `<input type="text" id="ef-label_ja" value="${escapeHtml(meta.label_ja || '')}">`);
    row('英語ラベル', 'label_en',
      `<input type="text" id="ef-label_en" value="${escapeHtml(meta.label_en || '')}">`);
  }
  row('運営者', 'operator',
    `<input type="text" id="ef-operator" value="${escapeHtml(meta.operator || '')}">`);
  row('備考', 'note',
    `<textarea id="ef-note" rows="2">${escapeHtml(meta.note || '')}</textarea>`);

  formHtml += `</tbody></table>
    <div class="edit-actions">
      <button id="btn-save-edit">保存</button>
      <button id="btn-cancel-edit" class="small-btn">キャンセル</button>
    </div>
    <div id="edit-result"></div>
  `;
  detail.innerHTML = formHtml;

  // apply_periods の追加/削除
  if (kind === 'special') {
    const attachRemoveHandlers = () => {
      detail.querySelectorAll('.ef-p-remove').forEach(btn => {
        btn.onclick = () => btn.closest('.period-row').remove();
      });
    };
    attachRemoveHandlers();
    document.getElementById('ef-add-period').onclick = () => {
      const container = document.getElementById('ef-apply-periods');
      container.insertAdjacentHTML('beforeend', `<div class="period-row">
        <input type="text" class="ef-p-from" placeholder="YYYY-MM-DD">
        〜
        <input type="text" class="ef-p-until" placeholder="YYYY-MM-DD">
        <button type="button" class="ef-p-remove small-btn">削除</button>
      </div>`);
      attachRemoveHandlers();
    };
  }

  document.getElementById('btn-cancel-edit').onclick = () => {
    renderFileDetail(kind, file, doc);
  };
  document.getElementById('btn-save-edit').onclick = async () => {
    const updates = collectEditUpdates(kind);
    const out = document.getElementById('edit-result');
    out.innerHTML = '保存中...';
    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, file, meta_updates: updates }),
      });
      const json = await res.json();
      if (!res.ok) {
        out.innerHTML = '<span class="check-fail">保存エラー: ' + escapeHtml(json.error || res.statusText) + '</span>';
        return;
      }
      out.innerHTML = '<span class="check-pass">✅ 保存しました</span>';
      // ファイル名が変わっている可能性があるので一覧を再ロード
      _filesCache = null;
      await loadFileList(true);
      // 新ファイル名で詳細を開きなおす
      const newFile = json.result.data_file.split('/').pop();
      _selectedFileId = `${kind}/${newFile}`;
      loadFileDetail(kind, newFile);
    } catch (e) {
      out.innerHTML = '<span class="check-fail">通信エラー: ' + escapeHtml(e.message) + '</span>';
    }
  };
}

function collectEditUpdates(kind) {
  const get = id => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  const updates = {};
  if (kind === 'regular') {
    updates.valid_from = get('ef-valid_from');
    updates.valid_until = get('ef-valid_until');  // 空なら '' → サーバ側で None
  } else {
    const periods = [];
    document.querySelectorAll('#ef-apply-periods .period-row').forEach(row => {
      const from = row.querySelector('.ef-p-from').value.trim();
      const until = row.querySelector('.ef-p-until').value.trim();
      if (from || until) periods.push({ from, until });
    });
    updates.apply_periods = periods;
    updates.display_from = get('ef-display_from');
    updates.display_until = get('ef-display_until');
    updates.label_ja = get('ef-label_ja');
    updates.label_en = get('ef-label_en');
  }
  updates.operator = get('ef-operator');
  updates.note = get('ef-note');
  return updates;
}

function renderScheduleInto(container, r) {
  container.innerHTML = '';
  if (!r.routes || r.routes.length === 0) {
    container.textContent = '(時刻表データなし)';
    return;
  }
  const derivedStopIndices = new Set();
  const derived = r.meta && r.meta.derived_fields;
  if (Array.isArray(derived)) {
    derived.forEach(d => {
      const m = (d.field || '').match(/\[(\d+)\.\.(\d+)\]/);
      if (m) {
        const a = parseInt(m[1]), b = parseInt(m[2]);
        for (let i = a; i <= b; i++) derivedStopIndices.add(i);
      }
    });
  }
  r.routes.forEach(route => {
    const wrapper = document.createElement('div');
    wrapper.className = 'route-block';
    const h = document.createElement('h4');
    h.textContent = route.name || route.id;
    wrapper.appendChild(h);
    const stops = route.stops || [];
    Object.entries(route.schedules || {}).forEach(([dayType, trips]) => {
      const sub = document.createElement('div');
      sub.className = 'day-block';
      sub.innerHTML = `<strong>${dayType}</strong> (${trips.length}便)`;
      if (trips.length > 0) {
        const tbl = document.createElement('table');
        const thead = document.createElement('thead');
        const head = document.createElement('tr');
        let headHtml = '<th>便</th>';
        stops.forEach((s, si) => {
          const isDerived = derivedStopIndices.has(si);
          headHtml += `<th${isDerived ? ' class="derived-col"' : ''}>${escapeHtml(s)}${isDerived ? '<br><span class="derived-mark">(推定)</span>' : ''}</th>`;
        });
        head.innerHTML = headHtml;
        thead.appendChild(head);
        tbl.appendChild(thead);
        const tbody = document.createElement('tbody');
        trips.forEach((trip, ti) => {
          const tr = document.createElement('tr');
          let html = `<td>${ti + 1}便</td>`;
          stops.forEach((_, si) => {
            const isDerived = derivedStopIndices.has(si);
            html += `<td${isDerived ? ' class="derived-cell"' : ''}>${trip[si] || '-'}</td>`;
          });
          tr.innerHTML = html;
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        sub.appendChild(tbl);
      }
      wrapper.appendChild(sub);
    });
    container.appendChild(wrapper);
  });
}
