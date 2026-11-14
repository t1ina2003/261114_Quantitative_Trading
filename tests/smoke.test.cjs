'use strict';
// Dependency-free smoke tests. Run: node tests/smoke.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class MockElement {
  constructor(name) {
    this.name = name;
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    const names = new Set();
    this.classList = {
      add: (n) => names.add(n),
      remove: (n) => names.delete(n),
      toggle: (n, force) => force === true ? names.add(n) : force === false ? names.delete(n) : names.has(n) ? names.delete(n) : names.add(n),
      contains: (n) => names.has(n)
    };
  }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  replaceChildren(...nodes) { this.children = nodes; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); }
  setAttribute(name, value) { this[name] = value; }
  scrollIntoView() {}
}

async function main() {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new MockElement(id));
    return elements.get(id);
  };
  const marketButtons = ['bull', 'sideways', 'bear'].map((scenario) => {
    const button = new MockElement('button');
    button.dataset.scenario = scenario;
    return button;
  });
  const document = {
    getElementById: get,
    querySelectorAll: (selector) => selector === '.market-option' ? marketButtons : [],
    createElement: (name) => new MockElement(name),
    createElementNS: (namespace, name) => new MockElement(name)
  };
  const code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  vm.runInNewContext(code, {document, window: {matchMedia: () => ({matches: false})}}, {timeout: 3000});

  assert.match(get('dataTitle').textContent, /合成資料/);
  assert.equal(get('metrics').children.length, 4);
  assert.equal(get('gameFeedback').hidden, true);
  assert(get('equityChart').children.filter((el) => el.name === 'path').length >= 2);
  assert.match(get('metrics').children[1].children[1].textContent, /點/);

  get('reveal').listeners.click();
  assert.equal(get('gameFeedback').hidden, false);
  assert.match(get('metricHeading').textContent, /樣本外/);
  assert.match(get('decisionText').textContent, /買入持有/);

  get('strategy').listeners.change({target: {value: 'dip'}});
  assert.equal(get('dipControls').hidden, false);
  assert.equal(get('gameFeedback').hidden, true);
  get('dipThreshold').listeners.input({target: {value: 7}});
  assert.match(get('dipValue').textContent, /7%/);
  get('fee').listeners.input({target: {value: 0.45}});
  assert.match(get('feeValue').textContent, /0.45%/);

  marketButtons[2].listeners.click();
  assert.match(get('dataTitle').textContent, /熊市考驗/);

  const csvRows = ['Date,Adj Close'];
  for (let i = 0; i < 150; i++) {
    const date = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    csvRows.push(date + ',' + (100 + i * 0.25).toFixed(2));
  }
  const csv = {name: 'my_prices.csv', size: 4096, text: async () => csvRows.join('\r\n')};
  await get('csvInput').listeners.change({target: {files: [csv]}});
  assert.match(get('uploadStatus').textContent, /150 筆價格/);
  assert.match(get('dataTitle').textContent, /my_prices.csv/);
  get('reveal').listeners.click();
  const values = get('metrics').children.map((card) => card.children[1].textContent);
  assert(values.every((value) => !/NaN|Infinity/.test(value)), 'metrics should remain finite');

  await get('csvInput').listeners.change({target: {files: [{name:'bad.csv',size:40,text:async()=> 'invalid,data\n1,2'}]}});
  assert.match(get('uploadStatus').textContent, /匯入失敗/);
  get('backToSim').listeners.click();
  assert.match(get('dataTitle').textContent, /合成資料/);

  process.stdout.write('PASS: initial chart, strategy parameters, blind test, CSV import and validation\n');
}

main().catch((error) => {console.error(error); process.exitCode = 1;});
