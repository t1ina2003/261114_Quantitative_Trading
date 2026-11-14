'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const SVG = 'http://www.w3.org/2000/svg';
  const state = {
    scenario: 'bull', seed: 20261114, data: [], source: 'sim', filename: '',
    strategy: 'trend', fast: 15, slow: 60, threshold: 5,
    fee: 0.15, revealed: false
  };
  const scenarioTitles = {bull: '牛市轉折', sideways: '震盪市場', bear: '熊市考驗'};
  const money = (n) => Number(n).toLocaleString('zh-TW', {maximumFractionDigits: 0});
  const percent = (n) => (n > 0 ? '+' : '') + (n * 100).toFixed(1) + '%';
  const compactDate = (d) => d ? d.replace(/-/g, '/') : '—';
  const random = (seed) => {
    let value = seed >>> 0;
    return function () {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function generateData() {
    const rand = random(state.seed + ({bull: 2, sideways: 31, bear: 67}[state.scenario]));
    const result = [];
    let close = 100, date = new Date(Date.UTC(2024, 0, 2));
    let previousNoise = 0;
    for (let i = 0; result.length < 360; i++) {
      const day = date.getUTCDay();
      if (day !== 0 && day !== 6) {
        const k = result.length;
        const train = k < 252;
        let drift = 0, wave = 0, volatility = 0.012;
        if (state.scenario === 'bull') {
          drift = train ? 0.00165 : -0.0013;
          wave = 0.002 * Math.sin(k / 12);
          volatility = train ? 0.011 : 0.018;
        } else if (state.scenario === 'sideways') {
          drift = train ? 0.0001 : 0.00025;
          wave = 0.005 * Math.sin(k / 7);
          volatility = train ? 0.013 : 0.016;
        } else {
          drift = train ? -0.00075 : 0.0017;
          wave = 0.003 * Math.sin(k / 15);
          volatility = train ? 0.017 : 0.014;
        }
        const shock = (rand() + rand() + rand() + rand() - 2) * volatility * 1.75;
        previousNoise = 0.15 * previousNoise + shock;
        close = Math.max(6, close * Math.exp(drift + wave + previousNoise));
        result.push({date: date.toISOString().slice(0, 10), close: Number(close.toFixed(4))});
      }
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return result;
  }

  // Signals are formed using information through day t only.
  // A signal at t trades at day t+1 close; its first earned return is t+1 -> t+2.
  function buildSignals(closes, mode) {
    const n = closes.length;
    const signals = new Array(n).fill(0);
    const sums = [0];
    closes.forEach((v) => sums.push(sums[sums.length - 1] + v));
    const average = (last, window) => (sums[last + 1] - sums[last + 1 - window]) / window;
    for (let i = 0; i < n; i++) {
      if (mode === 'hold') {
        signals[i] = 1;
      } else if (mode === 'trend') {
        signals[i] = i >= state.slow - 1 && average(i, state.fast) > average(i, state.slow) ? 1 : 0;
      } else {
        signals[i] = i > 0 ? signals[i - 1] : 0;
        if (i >= 19) {
          const center = average(i, 20);
          if (closes[i] <= center * (1 - state.threshold / 100)) signals[i] = 1;
          else if (closes[i] >= center) signals[i] = 0;
        }
      }
    }
    return signals;
  }

  function backtest(closes, mode) {
    const signals = buildSignals(closes, mode);
    const values = [10000];
    const changes = [0];
    let position = 0;
    for (let i = 1; i < closes.length; i++) {
      const desired = i >= 2 ? signals[i - 2] : 0;
      const turn = Math.abs(desired - position);
      const transactionCost = state.fee / 100 * turn;
      const assetReturn = closes[i] / closes[i - 1] - 1;
      // The position decided at the previous close earns the next close-to-close return.
      values.push(values[i - 1] * (1 - transactionCost) * (1 + desired * assetReturn));
      changes.push(turn);
      position = desired;
    }
    return {values, changes};
  }

  function stats(run, start, end) {
    const values = run.values;
    let peak = values[start], worst = 0, trades = 0;
    for (let i = start; i <= end; i++) {
      peak = Math.max(peak, values[i]);
      worst = Math.max(worst, 1 - values[i] / peak);
      if (i > start) trades += run.changes[i];
    }
    return {returnRate: values[end] / values[start] - 1, drawdown: worst, trades};
  }

  function changeMarket(scenario, nextSeed) {
    state.scenario = scenario;
    state.source = 'sim';
    state.filename = '';
    if (nextSeed) state.seed += 11939;
    state.data = generateData();
    $('uploadStatus').textContent = '';
    $('backToSim').hidden = true;
    document.querySelectorAll('.market-option').forEach((el) => {
      el.classList.toggle('active', el.dataset.scenario === state.scenario);
      el.setAttribute('aria-pressed', String(el.dataset.scenario === state.scenario));
    });
    resetReveal();
  }

  function resetReveal() {
    state.revealed = false;
    $('stepThree').classList.remove('is-active');
    $('reveal').disabled = false;
    $('reveal').innerHTML = '揭曉樣本外結果 <span>→</span>';
    $('decisionTitle').textContent = '策略在沒看過的資料還有用嗎？';
    $('decisionText').textContent = '歷史回測很容易挑出漂亮結果。按下揭曉，才知道你調整的參數遇到下一段行情時表現如何。';
    $('gameFeedback').hidden = true;
    $('insightText').textContent = '它讓「感覺會漲」變成可以重複測試的明確規則，並讓你同時看見報酬、風險和交易成本。';
    render();
  }

  function updateControls() {
    $('fastValue').textContent = state.fast + ' 日';
    $('slowValue').textContent = state.slow + ' 日';
    $('dipValue').textContent = state.threshold + '%';
    $('feeValue').textContent = state.fee.toFixed(2) + '%';
    $('trendControls').hidden = state.strategy !== 'trend';
    $('dipControls').hidden = state.strategy !== 'dip';
    $('strategyExplainer').textContent = state.strategy === 'trend'
      ? '短期均線高於長期均線時持有，否則轉為現金。只做多、不做空。'
      : '價格跌到 20 日均線下方指定幅度時買入；回到均線附近就賣出。';
  }

  function renderMetrics(trainA, trainB, testA, testB) {
    const a = state.revealed ? testA : trainA;
    const b = state.revealed ? testB : trainB;
    const rows = [
      ['我的策略報酬', percent(a.returnRate), '買入持有：' + percent(b.returnRate), a.returnRate >= 0 ? 'up' : 'down'],
      ['贏過大盤基準', percent(a.returnRate - b.returnRate), '報酬差距（百分點）', a.returnRate >= b.returnRate ? 'up' : 'down'],
      ['最大回撤', '-' + (a.drawdown * 100).toFixed(1) + '%', '買入持有：-' + (b.drawdown * 100).toFixed(1) + '%', a.drawdown <= b.drawdown ? 'up' : 'down'],
      ['換倉次數', String(a.trades) + ' 次', '每次買進或賣出均計 1 次', '']
    ];
    $('metrics').replaceChildren();
    rows.forEach((row) => {
      const div = document.createElement('div');
      div.className = 'metric-card';
      const heading = document.createElement('p');
      const value = document.createElement('strong');
      const detail = document.createElement('span');
      heading.textContent = row[0];
      value.textContent = row[1];
      value.className = row[3];
      detail.textContent = row[2];
      div.append(heading, value, detail);
      $('metrics').appendChild(div);
    });
    // Difference is already in percentage points, despite the percentage symbol used to display it.
    $('metricHeading').textContent = state.revealed ? '樣本外測試成績' : '訓練期間成績';
  }

  function element(name, attrs, textValue) {
    const el = document.createElementNS(SVG, name);
    Object.entries(attrs || {}).forEach(([key, value]) => el.setAttribute(key, String(value)));
    if (textValue !== undefined) el.textContent = textValue;
    return el;
  }

  function drawChart(a, b, split) {
    const svg = $('equityChart');
    svg.replaceChildren();
    const total = a.length;
    const lastVisible = state.revealed ? total - 1 : split - 1;
    const left = 57, right = 802, top = 19, bottom = 294;
    const x = (i) => left + (i / (total - 1)) * (right - left);
    const presented = a.slice(0, lastVisible + 1).concat(b.slice(0, lastVisible + 1));
    let low = Math.min(...presented) / 100, high = Math.max(...presented) / 100;
    const pad = Math.max(2, (high - low) * 0.17);
    low = Math.max(0, low - pad);
    high += pad;
    const y = (v) => bottom - ((v / 100 - low) / (high - low)) * (bottom - top);

    svg.appendChild(element('rect', {x: x(split - 1), y: top, width: right - x(split - 1), height: bottom - top, fill: '#1b293b', opacity: 0.75, rx: 3}));
    for (let j = 0; j <= 4; j++) {
      const value = low + ((high - low) * j / 4);
      const pos = bottom - (bottom - top) * j / 4;
      svg.appendChild(element('line', {x1: left, x2: right, y1: pos, y2: pos, stroke: '#354559', 'stroke-dasharray': '3 6', opacity: .72}));
      svg.appendChild(element('text', {x: left - 10, y: pos + 3, fill: '#8d9fb3', 'font-size': 11, 'text-anchor': 'end'}, (value - 100).toFixed(0) + '%'));
    }
    svg.appendChild(element('line', {x1: x(split - 1), x2: x(split - 1), y1: top, y2: bottom, stroke: '#f6c77b', 'stroke-dasharray': '6 5', opacity: .85}));
    svg.appendChild(element('text', {x: x(split - 1) - 8, y: top + 11, 'text-anchor': 'end', 'font-size': 11, fill: '#aac3d2'}, '訓練 70%'));
    svg.appendChild(element('text', {x: x(split - 1) + 9, y: top + 11, 'text-anchor': 'start', 'font-size': 11, fill: '#f6c77b'}, '測試 30%'));
    if (!state.revealed) {
      svg.appendChild(element('text', {x: (x(split - 1) + right) / 2, y: (top + bottom) / 2 - 4, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': '700', fill: '#a7b8cd'}, '測試資料'));
      svg.appendChild(element('text', {x: (x(split - 1) + right) / 2, y: (top + bottom) / 2 + 14, 'text-anchor': 'middle', 'font-size': 11, fill: '#8b9eb3'}, '尚未揭曉'));
    }
    function path(series) {
      let d = '';
      for (let i = 0; i <= lastVisible; i++) {
        d += (i === 0 ? 'M' : 'L') + x(i).toFixed(2) + ',' + y(series[i]).toFixed(2) + ' ';
      }
      return d.trim();
    }
    svg.appendChild(element('path', {d: path(b), fill: 'none', stroke: '#87aaff', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'}));
    svg.appendChild(element('path', {d: path(a), fill: 'none', stroke: '#71e0c3', 'stroke-width': 3.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'}));
    svg.appendChild(element('circle', {cx: x(lastVisible), cy: y(a[lastVisible]), r: 4.5, fill: '#71e0c3', stroke: '#142132', 'stroke-width': 2}));
    svg.appendChild(element('circle', {cx: x(lastVisible), cy: y(b[lastVisible]), r: 3.5, fill: '#87aaff', stroke: '#142132', 'stroke-width': 1.5}));
    const dates = state.data;
    [[0, 'start'], [split - 1, 'middle'], [total - 1, 'end']].forEach(([i, key]) => {
      const alignment = key === 'start' ? 'start' : key === 'end' ? 'end' : 'middle';
      svg.appendChild(element('text', {x: x(i), y: 324, fill: '#8ea1b4', 'font-size': 11, 'text-anchor': alignment}, compactDate(dates[i].date)));
    });
    svg.setAttribute('aria-label', state.revealed ? '策略和買入持有在訓練與樣本外測試期間的淨值折線圖' : '只顯示訓練期的策略與買入持有淨值曲線，測試期間尚未揭曉');
  }

  function render() {
    if (!state.data.length) return;
    updateControls();
    const closes = state.data.map((point) => point.close);
    const split = Math.floor(closes.length * 0.7);
    const a = backtest(closes, state.strategy);
    const b = backtest(closes, 'hold');
    const trainA = stats(a, 0, split - 1);
    const trainB = stats(b, 0, split - 1);
    const testA = stats(a, split - 1, closes.length - 1);
    const testB = stats(b, split - 1, closes.length - 1);
    const title = state.source === 'sim'
      ? '合成資料 · ' + scenarioTitles[state.scenario] + ' · ' + state.data.length + ' 個交易日'
      : '自訂 CSV · ' + state.filename + ' · ' + state.data.length + ' 筆日價格';
    $('dataTitle').textContent = title;
    $('statusBadge').textContent = state.revealed ? '測試結果已揭曉' : '只看訓練資料';
    $('statusBadge').classList.toggle('revealed', state.revealed);
    $('dateRange').textContent = (state.revealed ? compactDate(state.data[split - 1].date) + ' ～ ' + compactDate(state.data.at(-1).date) : compactDate(state.data[0].date) + ' ～ ' + compactDate(state.data[split - 1].date));
    drawChart(a.values, b.values, split);
    renderMetrics(trainA, trainB, testA, testB);
    if (state.revealed) updateFeedback(trainA, trainB, testA, testB);
  }

  function updateFeedback(trainA, trainB, testA, testB) {
    const beat = testA.returnRate > testB.returnRate;
    const safer = testA.drawdown < testB.drawdown;
    const positive = testA.returnRate > 0;
    const score = Number(beat) + Number(safer) + Number(positive);
    const spread = (testA.returnRate - testB.returnRate) * 100;
    $('decisionTitle').textContent = '你的策略通過考試了嗎？';
    $('decisionText').textContent = '訓練期的報酬是 ' + percent(trainA.returnRate) + '，沒看過的測試期則是 ' + percent(testA.returnRate) + '。同一期買入持有為 ' + percent(testB.returnRate) + '。';
    const feedback = $('gameFeedback');
    feedback.hidden = false;
    const outcome = score >= 2 ? '完成挑戰：找到值得繼續研究的線索' : '研究警報：策略尚未證明自己有優勢';
    const gapText = '與買入持有相比，測試期差距為 ' + (spread >= 0 ? '+' : '') + spread.toFixed(1) + ' 個百分點。';
    feedback.replaceChildren();
    const heading = document.createElement('h3'), description = document.createElement('p'), note = document.createElement('small');
    heading.textContent = score + '/3 項檢查達標 · ' + outcome;
    description.textContent = gapText + ' 三項檢查：正報酬 ' + (positive ? '✓' : '×') + '、勝過基準 ' + (beat ? '✓' : '×') + '、較低回撤 ' + (safer ? '✓' : '×') + '。';
    note.textContent = '提醒：這是練習關卡，不是交易訊號；過了一次樣本外測試，也不能證明未來會賺錢。';
    feedback.append(heading, description, note);
    $('insightText').textContent = beat
      ? '你在這一段測試資料的報酬勝過買入持有，但仍可能只是運氣。接著要跨不同時間、市況與標的重複驗證，並避免偷看考試答案調參。'
      : '這次策略輸給買入持有！量化回測的價值正是能及早否決看似有道理、實際表現不佳的策略，避免靠感覺投入真錢。';
  }

  // Minimal RFC-4180-style reader: quoted fields and quoted line breaks are accepted.
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') {field += '"'; i++;}
        else quoted = !quoted;
      } else if (c === ',' && !quoted) {
        row.push(field.trim()); field = '';
      } else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field.trim());
        if (row.some((x) => x.length)) rows.push(row);
        row = []; field = '';
      } else field += c;
    }
    if (quoted) throw new Error('CSV 引號沒有正確結束。');
    row.push(field.trim());
    if (row.some((x) => x.length)) rows.push(row);
    if (!rows.length) throw new Error('CSV 沒有資料。');
    const clean = (s) => String(s || '').toLowerCase().replace(/[\s_-]/g, '');
    const headers = rows[0].map(clean);
    const dateCol = headers.findIndex((h) => h === 'date' || h === '日期');
    let priceCol = headers.findIndex((h) => h === 'adjclose' || h === 'adjustedclose' || h === '調整後收盤價');
    if (priceCol < 0) priceCol = headers.findIndex((h) => h === 'close' || h === '收盤價' || h === '收盤');
    if (dateCol < 0 || priceCol < 0) throw new Error('找不到 Date 與 Close（或 Adj Close）欄位。');
    const dataByDay = new Map();
    for (const line of rows.slice(1)) {
      const raw = line[dateCol] || '';
      let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(raw);
      if (!m) m = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
      if (!m) continue;
      const year = +m[1], month = +m[2], day = +m[3];
      const parsedDate = new Date(Date.UTC(year, month - 1, day));
      if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCDate() !== day) continue;
      const close = Number(String(line[priceCol] || '').replace(/,/g, '').replace(/\$/g, ''));
      if (!Number.isFinite(close) || close <= 0) continue;
      dataByDay.set(parsedDate.toISOString().slice(0, 10), {date: parsedDate.toISOString().slice(0, 10), close});
    }
    const data = [...dataByDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (data.length < 120) throw new Error('有效股價資料需要至少 120 個不同日期；目前只有 ' + data.length + ' 筆。');
    return data.length > 5000 ? data.slice(-5000) : data;
  }

  async function importFile(file) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('檔案請不要超過 5 MB。');
      const raw = await file.text();
      const parsed = parseCSV(raw);
      state.data = parsed; state.source = 'csv'; state.filename = file.name.slice(0, 60);
      document.querySelectorAll('.market-option').forEach((el) => {el.classList.remove('active'); el.setAttribute('aria-pressed', 'false');});
      $('backToSim').hidden = false;
      $('uploadStatus').textContent = '已載入 ' + parsed.length + ' 筆價格。資料只留在本機瀏覽器。';
      resetReveal();
    } catch (error) {
      $('uploadStatus').textContent = '匯入失敗：' + error.message;
    } finally {
      $('csvInput').value = '';
    }
  }

  function downloadCSV() {
    const lines = ['Date,Close'].concat(state.data.map((p) => p.date + ',' + p.close));
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = state.source === 'sim' ? 'quant_quest_simulated_prices.csv' : 'quant_quest_prices_copy.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.querySelectorAll('.market-option').forEach((button) => button.addEventListener('click', () => changeMarket(button.dataset.scenario, false)));
  $('reshuffle').addEventListener('click', () => changeMarket(state.scenario, true));
  $('backToSim').addEventListener('click', () => changeMarket(state.scenario, false));
  $('strategy').addEventListener('change', (e) => {state.strategy = e.target.value; resetReveal();});
  [['fast', 'fast'], ['slow', 'slow'], ['dipThreshold', 'threshold'], ['fee', 'fee']].forEach(([id, property]) => {
    $(id).addEventListener('input', (e) => {state[property] = Number(e.target.value); resetReveal();});
  });
  $('csvInput').addEventListener('change', (e) => importFile(e.target.files[0]));
  $('downloadSample').addEventListener('click', downloadCSV);
  $('reveal').addEventListener('click', () => {
    state.revealed = true;
    $('stepThree').classList.add('is-active');
    $('reveal').disabled = true;
    $('reveal').innerHTML = '已揭曉，調整策略可重新挑戰 <span>✓</span>';
    render();
    if (window.matchMedia('(max-width: 790px)').matches) $('metricHeading').scrollIntoView({behavior:'smooth', block:'center'});
  });
  changeMarket('bull', false);
})();