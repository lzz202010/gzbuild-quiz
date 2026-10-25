'use strict';
/* 管综冲刺刷题 · 纯前端单页应用
   数据来自 data.js(由 build_site.py 从 math_data.py / logic_data.py 生成) */

const BANK = window.BANK;
const LETTERS = 'ABCDE';
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩';
const COND_OPTS = [
  '条件(1)充分,但条件(2)不充分',
  '条件(2)充分,但条件(1)不充分',
  '条件(1)和(2)单独都不充分,但条件(1)和(2)联合起来充分',
  '条件(1)充分,条件(2)也充分',
  '条件(1)和(2)单独都不充分,条件(1)和(2)联合起来也不充分',
];
const COND_RUBRIC = '条件充分性判断选项含义:A. 条件(1)充分,但条件(2)不充分　B. 条件(2)充分,但条件(1)不充分　C. 条件(1)(2)单独都不充分,但联合起来充分　D. 条件(1)充分,条件(2)也充分　E. 条件(1)(2)单独和联合起来都不充分';

const $app = document.getElementById('app');
const KEY_WRONG = 'gzm.wrong.v1', KEY_HIST = 'gzm.hist.v1';

function load(k, d) {
  try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; }
  catch (e) { return d; }
}
let wrongBook = load(KEY_WRONG, {});   // 收录本:id -> {t:重做错次数, last:收录时间, pick:错选, star:手动收录}
if (load('gzm.ver', 1) < 2 && window.BANK && BANK.legacy) {
  wrongBook = Object.fromEntries(Object.entries(wrongBook).map(function (e) {
    return [BANK.legacy[e[0]] || e[0], e[1]];
  }));
  localStorage.setItem(KEY_WRONG, JSON.stringify(wrongBook));
  localStorage.setItem('gzm.ver', '2');
}
let hist = load(KEY_HIST, []);         // 最近成绩
const saveWrong = () => localStorage.setItem(KEY_WRONG, JSON.stringify(wrongBook));
const saveHist = () => localStorage.setItem(KEY_HIST, JSON.stringify(hist));

let quiz = null;            // 当前做题会话
const KEY_SESSION = 'gzm.session.v1';

function saveSession() {
  if (!quiz) return;
  if (quiz.done) { localStorage.removeItem(KEY_SESSION); return; }
  try {
    localStorage.setItem(KEY_SESSION, JSON.stringify({
      title: quiz.title, kind: quiz.kind, mode: quiz.mode, subj: quiz.subj,
      full: quiz.full, setNo: quiz.setNo, setName: quiz.setName, origin: quiz.origin || '#/',
      ids: quiz.list.map(q => q.id), idx: quiz.idx, ans: quiz.ans, locked: quiz.locked
    }));
  } catch (e) {}
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem(KEY_SESSION)); } catch (e) { return null; }
}

function restoreSession() {
  const s = loadSession();
  if (!s || !s.ids || !s.ids.length) return null;
  const list = s.ids.map(id => BANK.qmap[id]).filter(Boolean);
  if (!list.length) { localStorage.removeItem(KEY_SESSION); return null; }
  quiz = { title: s.title, kind: s.kind, mode: s.mode, subj: s.subj,
           full: !!s.full, setNo: s.setNo, setName: s.setName,
           origin: s.origin || '#/', list: list,
           idx: Math.min(s.idx || 0, list.length - 1),
           ans: s.ans || {}, locked: s.locked || {},
           done: false, showResult: false };
  return quiz;
}
let drillSubj = 'math';
let ansSubj = 'math';
let ansSetFilter = '';

function plainText(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent;
}
let wrongFilter = 'all';    // 错题本过滤:all / due / star

/* ───────────── 单题正计时(督促) ───────────── */
let qTimerId = null, qTimerStart = 0, qTimerIdx = -1;

function stopQTimer() {
  if (qTimerId) { clearInterval(qTimerId); qTimerId = null; }
  qTimerIdx = -1;
}

function tickQTimer() {
  const t = document.getElementById('qtimer');
  if (!t) {                                  // 元素暂时不在(重渲染间隙)→ 不停表,下轮再试
    if (quiz && !quiz.done) return;
    stopQTimer(); return;
  }
  const sec = Math.floor((Date.now() - qTimerStart) / 1000);
  t.textContent = '⏱ ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  t.classList.toggle('warn', sec >= 180 && sec < 240);   // 3 分钟起闪烁
  t.classList.toggle('off', sec >= 240);                  // 4 分钟消失
}

function ensureQTimer(idx) {
  if (qTimerIdx === idx && qTimerId) return;   // 同一题不重置
  qTimerIdx = idx;
  qTimerStart = Date.now();
  if (qTimerId) clearInterval(qTimerId);
  qTimerId = setInterval(tickQTimer, 500);
  tickQTimer();
}

/* ───────────── 小工具 ───────────── */
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function todayStr() {  const d = new Date();
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}
function questionPlainText(q) {
  const strip = h => plainText(h).trim();
  let t = '【' + q.set + ' · 第 ' + q.no + ' 题】\n' + strip(q.stem);
  if (q.kind === 'cond') {
    t += '\n(1) ' + strip(q.c1) + '\n(2) ' + strip(q.c2);
    t += '\n(A 条件(1)充分但(2)不充分 / B 条件(2)充分但(1)不充分 / C 联合充分 / D 都充分 / E 都不充分)';
  } else {
    (q.opts || []).forEach(function (o, i) {
      t += '\n' + LETTERS[i] + '. ' + strip(o);
    });
  }
  if (q.fig) t += '\n(原题附有图形,见刷题页面)';
  return t;
}

function copyQuestion(q, btn) {
  const text = questionPlainText(q);
  const done = function () {
    const old = btn.textContent;
    btn.textContent = '已复制 ✓';
    btn.classList.add('copied');
    setTimeout(function () { btn.textContent = old; btn.classList.remove('copied'); }, 1400);
  };
  const fallback = function () {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { alert('复制失败,请手动选择'); }
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fallback);
  } else fallback();
}

function dispNo(q, i) {
  return quiz && quiz.full ? q.no : i + 1;
}

function qMeta(q) {
  if (q.subject === 'math') {
    let t = q.set + ' · 第 ' + q.no + ' 题';
    if (q.tag) t += ' · ' + q.tag;
    if (q.db) t += ' · 对标' + q.db;
    if (q.df) t += ' · ' + q.df;
    return t;
  }
  return q.set + ' · 第 ' + q.no + ' 题 · ' + q.cat + '·' + q.type;
}
function shortTag(q) {
  return q.subject === 'math' ? (q.tag || '').split('·').pop() : (q.type || '');
}
function relDays(ts) {
  const d = Math.floor((Date.now() - ts) / 86400000);
  return d <= 0 ? '今天' : d === 1 ? '昨天' : d + ' 天前';
}

/* ───────────── 收录与成绩记录 ─────────────
   错题本 = 纯收录模式:答错不自动进本,只有手动「☆ 收录」的高价值题才收录;
   收录的题重做时答错,只累计错误次数,不自动移出。 */
function recordResult(q, letter) {
  if (letter === q.ans || !wrongBook[q.id]) return;
  const r = wrongBook[q.id];
  r.t = (r.t || 0) + 1;
  r.pick = letter || null;
  r.last = Date.now();
  saveWrong();
}
/* 手动收录/移出:做题页的「☆ 收录」按钮 */
function toggleStar(id) {
  if (wrongBook[id]) delete wrongBook[id];
  else wrongBook[id] = { t: 0, s: 0, last: Date.now(), pick: null, star: true };
  saveWrong();
}
function starLabel(id) { return wrongBook[id] ? '★ 已收录' : '☆ 收录'; }
function pushHist(ok, total) {
  hist.unshift({ d: todayStr(), subj: quiz.subj, no: quiz.setNo || '-',
                 name: quiz.setName || '', ok: ok, total: total });
  hist = hist.slice(0, 30);
  saveHist();
}
function bestScore(subj, no) {
  let b = null;
  for (const r of hist) if (r.subj === subj && r.no === no && (!b || r.ok > b.ok)) b = r;
  return b;
}

/* ───────────── 开卷 / 答题 ───────────── */
function startSet(kind, subjKey, setIdx) {
  const subj = BANK.subjects[subjKey], set = subj.sets[setIdx];
  quiz = {
    kind: kind, mode: kind === 'exam' ? 'exam' : 'practice', subj: subjKey,
    title: subj.label + ' · ' + set.name,
    list: set.qs.slice(), idx: 0, ans: {}, locked: {},
    done: false, showResult: false,
    full: true, setNo: set.no, setName: set.name, origin: '#/'
  };
  location.hash = '#/quiz';
}
function startIds(ids, title, kind, origin) {
  const list = ids.map(id => BANK.qmap[id]).filter(Boolean);
  if (!list.length) { alert('没有可做的题目'); return; }
  quiz = {
    kind: kind || 'drill', mode: 'practice', subj: 'mixed',
    title: title, list: list, idx: 0, ans: {}, locked: {},
    done: false, showResult: false,
    full: false, setNo: null, origin: origin || '#/'
  };
  location.hash = '#/quiz';
}
function pick(i, li) {
  const q = quiz.list[i];
  if (!q || quiz.done) return;
  if (quiz.mode === 'exam') { quiz.ans[q.id] = LETTERS[li]; render(); return; }
  if (quiz.locked[q.id]) return;
  quiz.ans[q.id] = LETTERS[li];
  quiz.locked[q.id] = true;
  recordResult(q, quiz.ans[q.id]);
  if (quiz.list.every(x => quiz.locked[x.id])) { finishPractice(); return; }
  render();
}
function finishPractice() {
  stopQTimer();
  localStorage.removeItem(KEY_SESSION);
  quiz.done = true; quiz.showResult = true;
  if (quiz.full) {
    const ok = quiz.list.filter(q => quiz.ans[q.id] === q.ans).length;
    pushHist(ok, quiz.list.length);
  }
  render();
}
function submitExam() {
  if (!quiz || quiz.done) return;
  stopQTimer();
  localStorage.removeItem(KEY_SESSION);
  quiz.done = true; quiz.showResult = true;
  quiz.list.forEach(q => recordResult(q, quiz.ans[q.id] || ''));
  if (quiz.full) {
    const ok = quiz.list.filter(q => quiz.ans[q.id] === q.ans).length;
    pushHist(ok, quiz.list.length);
  }
  render();
}
/* 交卷前确认,提醒未答题数 */
function confirmSubmit() {
  const un = quiz.list.filter(x => !quiz.ans[x.id]).length;
  if (confirm(un ? '还有 ' + un + ' 题未作答,确认交卷?' : '确认交卷?')) submitExam();
}
function go(i) {
  quiz.idx = Math.max(0, Math.min(quiz.list.length - 1, i));
  quiz.showResult = false;
  render();
}

/* ───────────── 渲染分发 ───────────── */
function renderSidebar(hash) {
  const side = document.getElementById('side');
  side.innerHTML = '';
  const wrongN = Object.keys(wrongBook).length;
  const brand = el('div', 'brand');
  brand.append(el('div', 'brand-title', '管综冲刺刷题'));
  brand.append(el('div', 'brand-sub', BANK.updated + ' 更新'));
  side.append(brand);
  const nav = el('nav', 'snav');
  [['#/', '主页', '⌂'], ['#/drill', '专项练习', '◈'], ['#/wrong', '错题本', '★'],
   ['#/answers', '答案速查', '☰']]
    .forEach(function (item) {
      const active = hash === item[0] || (item[0] !== '#/' && hash.indexOf(item[0]) === 0);
      const a = el('a', 'sitem' + (active ? ' active' : ''));
      a.href = item[0];
      a.append(el('span', 'sicon', item[2]));
      a.append(el('span', 'slabel', item[1]));
      if (item[0] === '#/wrong' && wrongN) a.append(el('span', 'sbadge', String(wrongN)));
      nav.append(a);
    });
  side.append(nav);
  side.append(el('div', 'side-foot', '数学 ' + BANK.subjects.math.sets.reduce(function (s, x) { return s + x.qs.length; }, 0) +
    ' 题 · 逻辑 ' + BANK.subjects.logic.sets.reduce(function (s, x) { return s + x.qs.length; }, 0) + ' 题'));
}

function render() {
  const hash = location.hash || '#/';
  renderSidebar(hash);
  if (hash.indexOf('#/quiz') === 0) {
    if (!quiz && !restoreSession()) { location.hash = '#/'; return; }
    saveSession();
    renderQuiz();
    window.scrollTo(0, 0);
    return;
  }
  if (quiz && quiz.done) localStorage.removeItem(KEY_SESSION);
  else if (quiz) saveSession();   // 主动退出也保留断点
  stopQTimer();
  quiz = null;
  if (hash.indexOf('#/drill') === 0) renderDrill();
  else if (hash.indexOf('#/wrong') === 0) renderWrong();
  else if (hash.indexOf('#/answers') === 0) renderAnswers();
  else renderHome();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);

function backBar(title) {
  const b = el('div', 'pagebar');
  const btn = el('button', 'btn ghost small', '← 返回');
  btn.onclick = () => { location.hash = '#/'; };
  b.append(btn, el('h2', 'pagebar-title', title));
  return b;
}

/* ───────────── 首页 ───────────── */
const HELP_HTML =
  '<h3>怎么用</h3>' +
  '<p><b>两种模式各有分工</b>:<b>练习</b> = 边做边学,选完立即判分、显示考点与解析;<b>模考</b> = 仿真卷面,答题时不显示考点、不分对错,交卷后统一出分 —— 按真题分值计分(数学满分 75、逻辑满分 60),并给出逐题成绩单,交卷前会提醒未答题数。</p>' +
  '<p><b>错题本是纯收录模式</b>:答错不会自动进本,由你判断价值——做题时(无论对错)点 <b>☆ 收录此题</b> 把高价值题收进来,收录的题不会自动移出,可随时手动移出。错题本按考点统计收录分布,支持导出打印版 PDF 重做。所有记录只保存在本机浏览器,换浏览器或清缓存会丢失。</p>' +
  '<h3>如何更新题库</h3>' +
  '<ol>' +
  '<li>题库源文件:<code>gzbuild/math_data.py</code> 与 <code>gzbuild/logic_data.py</code>,直接增删改题目;</li>' +
  '<li>双击 <code>更新题库.command</code>(或在 gzbuild 目录运行 <code>python3 build_site.py</code>);</li>' +
  '<li>刷新网页即生效。PDF 版不受影响,仍由 <code>build_pdf.py</code> 生成。</li>' +
  '</ol>' +
  '<p>标记约定与 PDF 相同:<code>^{...}</code> 上标、<code>_{...}</code> 下标;数学解析中 <code>※</code> 后为易错点;逻辑解析里以「排」开头的行显示为易错提示。新增一套卷 = 在 <code>SETS</code> 里加一个 <code>{"no":"四","qs":[...]}</code> 块。</p>';

function renderHome() {
  $app.innerHTML = '';
  const w = el('div', 'wrap');

  const head = el('header', 'hero');
  head.append(el('div', 'badge', '2027 管理类联考(199)· 冲刺新编'));
  head.append(el('h1', '', '管综冲刺刷题'));
  const nm = Object.keys(BANK.subjects).reduce(function (a, k) {
    a[k] = BANK.subjects[k].sets.reduce(function (s, x) { return s + x.qs.length; }, 0);
    return a;
  }, {});
  const total = nm.math + nm.logic;
  head.append(el('p', 'hero-sub', '数学 ' + nm.math + ' 题 · 逻辑 ' + nm.logic + ' 题 · 共 ' + total +
    ' 题 · ' + Object.keys(BANK.subjects).length + ' 科 ' +
    Object.keys(BANK.subjects).reduce(function (n, k) { return n + BANK.subjects[k].sets.length; }, 0) +
    ' 套 · 题库更新于 ' + BANK.updated));
  w.append(head);

  const sess = loadSession();
  if (sess && sess.ids) {
    const valid = sess.ids.filter(id => BANK.qmap[id]);
    if (valid.length) {
      const answered = Object.keys(sess.mode === 'exam' ? (sess.ans || {}) : (sess.locked || {})).length;
      const rc = el('div', 'card sec resumecard');
      const info = el('div', 'rinfo');
      info.append(el('div', 'rtitle', '⏵ ' + sess.title));
      info.append(el('div', 'rmeta', '做到第 ' + ((sess.idx || 0) + 1) + ' 题 / 共 ' + valid.length +
        ' 题' + (answered ? ' · 已答 ' + answered : '')));
      rc.append(info);
      const cont = el('button', 'btn small', '继续');
      cont.onclick = function () { location.hash = '#/quiz'; };
      const drop = el('button', 'btn ghost small', '放弃');
      drop.onclick = function () {
        localStorage.removeItem(KEY_SESSION);
        render();
      };
      const acts = el('div', 'setacts');
      acts.append(cont, drop);
      rc.append(acts);
      w.append(rc);
    }
  }
  const homegrid = el('div', 'homegrid');
  Object.keys(BANK.subjects).forEach(function (key) {
    const subj = BANK.subjects[key];
    const sec = el('section', 'card sec hsec');
    sec.append(el('h2', 'sec-title', subj.label + ' · ' + subj.sets.length + ' 套'));
    // 分组渲染:真题展开置顶,其余折叠
    const groups = {};
    subj.sets.forEach(function (set) {
      (groups[set.group] = groups[set.group] || []).push(set);
    });
    const gnames = Object.keys(groups);
    gnames.forEach(function (gname) {
      const gsets = groups[gname];
      const gtag = gname === '历年真题';
      let box = sec;
      if (!gtag) {
        box = el('details', 'foldgroup');
        const sm = el('summary', '', '<b>' + gname + '</b><span class="catcnt">' +
          gsets.length + ' 套 · ' + gsets.reduce(function (s, x) { return s + x.qs.length; }, 0) + ' 题 ▾</span>');
        box.append(sm);
        sec.append(box);
      } else {
        sec.append(el('div', 'grouprow', gname));
      }
      gsets.forEach(function (set) {
        const gi = subj.sets.indexOf(set);
        appendSetRow(box, set, gi, key);
      });
    });
    function appendSetRow(container, set, i, key) {
      const sec2 = container;
      const row = el('div', 'setrow');
      row.append(el('div', 'setname', set.name));
      const best = bestScore(key, set.no);
      row.append(el('div', 'setmeta', set.qs.length + ' 题' + (best ? ' · 最好 ' + best.ok + '/' + best.total : '')));
      const acts = el('div', 'setacts');
      const p = el('button', 'btn small', '练习');
      p.setAttribute('data-subj', key); p.setAttribute('data-set', String(i)); p.setAttribute('data-mode', 'practice');
      p.onclick = () => startSet('practice', key, i);
      const e = el('button', 'btn ghost small', '模考');
      e.setAttribute('data-subj', key); e.setAttribute('data-set', String(i));
      e.onclick = () => startSet('exam', key, i);
      acts.append(p, e);
      row.append(acts);
      container.append(row);
    }
    homegrid.append(sec);
  });
  w.append(homegrid);

  const wrongN = Object.keys(wrongBook).length;
  if (hist.length) {
    const hc = el('section', 'card sec');
    hc.append(el('h2', 'sec-title', '最近成绩'));
    hist.slice(0, 6).forEach(function (r) {
      const row = el('div', 'setrow');
      row.append(el('div', 'setname small', (BANK.subjects[r.subj] ? BANK.subjects[r.subj].label : '') + ' ' + (r.name || '卷(' + r.no + ')')));
      row.append(el('div', 'setmeta', r.d));
      row.append(el('div', 'setbest', r.ok + '/' + r.total + ' · ' + Math.round(r.ok / r.total * 100) + '%'));
      hc.append(row);
    });
    const clr = el('button', 'btn ghost small', '清空成绩与错题记录');
    clr.onclick = function () {
      if (confirm('清空全部本地记录(最近成绩 + 错题本)?')) { hist = []; wrongBook = {}; saveHist(); saveWrong(); render(); }
    };
    hc.append(clr);
    w.append(hc);
  }

  const hd = el('details', 'helpcard');
  hd.append(el('summary', '', '<b>使用说明 / 如何更新题库</b>'));
  hd.append(el('div', 'helpbody', HELP_HTML));
  w.append(hd);

  $app.append(w);
}

/* ───────────── 做题页 ───────────── */
function navCls(q, i) {
  const a = quiz.ans[q.id];
  let c = '';
  if (i === quiz.idx) c += ' cur';
  if (quiz.done || quiz.locked[q.id]) {
    if (a == null) c += ' ans';
    else c += (a === q.ans ? ' ok' : ' bad');
  } else if (a) c += ' ans';
  return c;
}

function analysisPanel(q, chosen) {
  const p = el('div', 'panel');
  let html = '<div class="ansline">答案 <b class="ansletter">' + q.ans + '</b>';
  if (q.kind === 'cond') html += '<span class="ansmeaning">' + COND_OPTS[LETTERS.indexOf(q.ans)] + '</span>';
  if (chosen && chosen !== q.ans) html += '<span class="yourbad">你的答案:' + chosen + '</span>';
  else if (chosen) html += '<span class="yourok">✓ 答对</span>';
  else if (quiz && quiz.done) html += '<span class="yourbad">未作答</span>';
  html += '</div>';
  const collect = el('button', 'btn ghost small collect-btn',
    wrongBook[q.id] ? '★ 已收录' : '☆ 收录此题');
  collect.onclick = function () {
    toggleStar(q.id);
    collect.textContent = wrongBook[q.id] ? '★ 已收录' : '☆ 收录此题';
  };

  if (Array.isArray(q.sol)) {
    // 兼容旧数据:行列表
    q.sol.forEach(function (ln) {
      html += ln.t === 'trap'
        ? '<div class="trap">' + ln.h + '</div>'
        : '<div class="step">' + (CIRC[ln.n - 1] || ln.n + '.') + ' ' + ln.h + '</div>';
    });
  } else if (q.sol) {
    html += '<div class="solmain">' + q.sol + '</div>';
  } else {
    html += '<div class="nonsol">(本卷暂无逐题解析,以答案为准)</div>';
  }
  if (q.trap) html += '<div class="trap">' + q.trap + '</div>';
  p.innerHTML = html;
  p.append(collect);
  return p;
}

function questionCard(i) {
  const q = quiz.list[i];
  const cardEl = el('div', 'card qcard');
  const meta = el('div', 'qmeta');
  // 模考交卷前不显示考点/题型,仿真卷面
  const showTag = !(quiz.mode === 'exam' && !quiz.done);
  meta.append(el('span', '', showTag ? qMeta(q) : ('卷' + q.set + ' · 第 ' + q.no + ' 题')));
  const cpBtn = el('button', 'meta-copy', '📋 复制');
  cpBtn.title = '复制本题完整文本(出处+题干+选项),便于到其他工具查原题';
  cpBtn.onclick = function () { copyQuestion(q, cpBtn); };
  meta.append(cpBtn);
  const starBtn = el('button', 'starbtn', starLabel(q.id));
  starBtn.title = '收录到错题本 / 从错题本移出';
  starBtn.onclick = function () { toggleStar(q.id); starBtn.innerHTML = starLabel(q.id); };
  meta.append(starBtn);
  cardEl.append(meta);

  const stem = el('div', 'qstem');
  stem.innerHTML = '<span class="qno">' + dispNo(q, i) + '.</span> ' + q.stem +
    '<span class="blank"></span>';
  cardEl.append(stem);
  if (q.fig) {
    const img = el('img', 'qfig');
    img.src = q.fig;
    img.alt = '原题图示';
    cardEl.append(img);
  }

  const chosen = quiz.ans[q.id];
  const reveal = quiz.done || !!quiz.locked[q.id];
  const grid = el('div', 'optgrid');

  function optButton(L, txt) {
    const b = el('button', 'opt');
    b.innerHTML = '<span class="ol">' + L + '</span><span class="ot">' + txt + '</span>';
    const isChosen = chosen === L, isAns = q.ans === L;
    if (reveal) {
      if (isAns) b.classList.add('ok');
      if (isChosen && !isAns) b.classList.add('bad');
      if (isChosen) b.classList.add('chosen');
      b.disabled = true;
    } else {
      if (isChosen) b.classList.add('chosen');
      b.onclick = () => pick(i, LETTERS.indexOf(L));
    }
    return b;
  }

  if (q.kind === 'cond') {
    cardEl.append(el('div', 'cond', '(1) ' + q.c1));
    cardEl.append(el('div', 'cond', '(2) ' + q.c2));
    COND_OPTS.forEach(function (txt, li) { grid.append(optButton(LETTERS[li], txt)); });
  } else {
    q.opts.forEach(function (o, li) { grid.append(optButton(LETTERS[li], o)); });
  }
  cardEl.append(grid);

  if (reveal) cardEl.append(analysisPanel(q, chosen));

  const w = el('div', 'wrap');
  w.append(cardEl);

  const f = el('div', 'qfooter');
  const prev = el('button', 'btn ghost', '上一题');
  prev.disabled = quiz.idx === 0;
  prev.onclick = () => go(quiz.idx - 1);
  f.append(prev);
  f.append(el('span', 'fcount', (quiz.idx + 1) + ' / ' + quiz.list.length));
  if (!quiz.done) {
    if (quiz.mode === 'exam') {
      const nx = el('button', 'btn', quiz.idx === quiz.list.length - 1 ? '交卷' : '下一题');
      nx.onclick = function () {
        if (quiz.idx === quiz.list.length - 1) confirmSubmit();
        else go(quiz.idx + 1);
      };
      f.append(nx);
    } else {
      const last = quiz.idx === quiz.list.length - 1;
      const nx = el('button', 'btn', last ? '完成' : '下一题');
      nx.onclick = function () {
        if (last) {
          const un = quiz.list.filter(x => !quiz.locked[x.id]).length;
          if (un && !confirm('还有 ' + un + ' 题未作答,确定结束?')) return;
          finishPractice();
        } else go(quiz.idx + 1);
      };
      f.append(nx);
    }
  } else {
    const bk = el('button', 'btn', '返回成绩');
    bk.onclick = function () { quiz.showResult = true; render(); };
    f.append(bk);
  }
  w.append(f);
  return w;
}

function resultView() {
  const w = el('div', 'wrap');
  const c = el('div', 'card result');
  let ok = 0, un = 0;
  quiz.list.forEach(function (q) {
    const a = quiz.ans[q.id];
    if (a === q.ans) ok++;
    else if (!a) un++;
  });
  const total = quiz.list.length, pct = Math.round(ok / total * 100);
  c.append(el('div', 'score-big', ok + '<span class="score-total"> / ' + total + '</span>'));
  c.append(el('div', 'score-sub', '正确率 ' + pct + '%'));
  // 模考按真题分值给分(数学每题 3 分/满分 75,逻辑每题 2 分/满分 60)
  const subj = BANK.subjects[quiz.subj];
  if (quiz.mode === 'exam' && subj && subj.fullScore) {
    c.append(el('div', 'exam-score',
      '得分 ' + (ok * subj.scoreEach) + ' 分<span class="score-total"> / 满分 ' + subj.fullScore + ' 分(每题 ' + subj.scoreEach + ' 分)</span>'));
  }

  const grid = el('div', 'chipgrid');
  quiz.list.forEach(function (q, i) {
    const a = quiz.ans[q.id];
    const chip = el('button', 'chip ' + (a == null ? 'un' : a === q.ans ? 'ok' : 'bad'), String(dispNo(q, i)));
    chip.title = q.set + ' · ' + (quiz.full ? '第 ' + q.no + ' 题' : '原卷第 ' + q.no + ' 题');
    chip.onclick = function () { quiz.showResult = false; quiz.idx = i; render(); };
    grid.append(chip);
  });
  c.append(grid);

  // 模考专属:逐题成绩单
  if (quiz.mode === 'exam') {
    c.append(el('div', 'rtitle', '成绩单 · 点击任意一行查看该题解析'));
    const tbl = el('div', 'rtable');
    tbl.append(el('div', 'rhead', '<span>题号</span><span>你的答案</span><span>正确答案</span><span>考点 / 题型</span>'));
    quiz.list.forEach(function (q, i) {
      const a = quiz.ans[q.id];
      const row = el('button', 'rrow ' + (a == null ? 'un' : a === q.ans ? 'ok' : 'bad'),
        '<span>' + (i + 1) + '</span><span>' + (a || '—') + '</span><span>' + q.ans + '</span><span>' + shortTag(q) + '</span>');
      row.onclick = function () { quiz.showResult = false; quiz.idx = i; render(); };
      tbl.append(row);
    });
    c.append(tbl);
  }

  const acts = el('div', 'actions');
  const org = quiz.origin || '#/';
  const home = el('button', 'btn ghost', org === '#/drill' ? '返回专项练习' : org === '#/wrong' ? '返回错题本' : '返回主页');
  home.onclick = function () { const o = org; quiz = null; location.hash = o; };
  acts.append(home);
  const wrongIds = quiz.list.filter(q => quiz.ans[q.id] !== q.ans).map(q => q.id);
  if (wrongIds.length) {
    const b = el('button', 'btn', '重刷本次错题(' + wrongIds.length + ')');
    b.onclick = function () { startIds(wrongIds, '错题重刷 · ' + quiz.title, 'redo', quiz.origin || '#/'); };
    acts.append(b);
  }
  c.append(acts);
  w.append(c);
  return w;
}

function renderQuiz() {
  $app.innerHTML = '';

  const bar = el('div', 'topbar');
  const back = el('button', 'btn ghost small', quiz.done && quiz.showResult ? '返回主页' : '← 退出');
  back.onclick = function () {
    if (!quiz.done && quiz.mode === 'exam' && !confirm('模考未交卷,确定退出?')) return;
    const org = quiz && quiz.origin ? quiz.origin : '#/';
    quiz = null; location.hash = org;
  };
  bar.append(back);
  bar.append(el('div', 'topbar-title', quiz.title));
  const right = el('div', 'topbar-right');
  if (!quiz.done) {
    const qt = el('span', 'qtimer', '⏱ 0:00');
    qt.id = 'qtimer';
    qt.title = '本题用时(3 分钟后闪烁提醒,4 分钟隐去)';
    right.append(qt);
  }
  if (quiz.mode === 'exam' && !quiz.done) {
    const b = el('button', 'btn small', '交卷');
    b.onclick = function () { confirmSubmit(); };
    right.append(b);
  }
  bar.append(right);
  if (!quiz.done) ensureQTimer(quiz.idx); else stopQTimer();
  $app.append(bar);

  if (quiz.done && quiz.showResult) { $app.append(resultView()); return; }

  const nav = el('div', 'navgrid');
  quiz.list.forEach(function (q, i) {
    const b = el('button', 'nv' + navCls(q, i), String(dispNo(q, i)));
    if (!quiz.full) b.title = q.set + ' · 原卷第 ' + q.no + ' 题';
    b.onclick = function () { go(i); };
    nav.append(b);
  });
  $app.append(nav);

  $app.append(questionCard(quiz.idx));
}

/* ───────────── 专项练习(扁平:细分即卡片) ───────────── */
function drillInOrder(ids) { return ids.slice(); }

function drillRandom(ids) {
  return ids.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 10);
}

function renderDrill() {
  $app.innerHTML = '';
  const w = el('div', 'wrap');
  w.append(el('h2', 'pagetitle', '专项练习'));

  const tabs = el('div', 'tabs');
  Object.keys(BANK.subjects).forEach(function (key) {
    const t = el('button', 'tab' + (drillSubj === key ? ' active' : ''), BANK.subjects[key].label);
    t.onclick = function () { drillSubj = key; render(); };
    tabs.append(t);
  });
  w.append(tabs);

  const subj = BANK.subjects[drillSubj];
  const grid = el('div', 'drillgrid');
  subj.cats.forEach(function (cat) {
    grid.append(el('div', 'grouprow', cat.g));
    cat.subs.slice().sort(function (a, b) { return b.ids.length - a.ids.length; })
      .forEach(function (s) {
        if (s.ids.length < 2) return;  // 单题细分不单列
        const wrongN = s.ids.filter(function (id) { return wrongBook[id]; }).length;
        const card = el('div', 'dcard flat');
        const head = el('div', 'dcard-head');
        head.append(el('span', 'dcard-name', s.n.replace(/^(数学|逻辑)/, '')));
        const right = el('span', 'dcard-right');
        if (wrongN) right.append(el('span', 'dcard-wrong', '错 ' + wrongN));
        right.append(el('span', 'dcard-n', s.ids.length + ' 题'));
        head.append(right);
        card.append(head);
        const acts = el('div', 'dcard-acts');
        const all = el('button', 'btn small', '全部 ' + s.ids.length);
        all.onclick = function () {
          startIds(drillInOrder(s.ids), subj.label + ' · ' + cat.g + ' · ' + s.n, 'drill', '#/drill');
        };
        const rnd = el('button', 'btn ghost small', '随机');
        rnd.title = '随机抽 10 题';
        rnd.onclick = function () {
          startIds(drillRandom(s.ids), subj.label + ' · ' + cat.g + ' · ' + s.n + ' · 随机', 'drill', '#/drill');
        };
        acts.append(all, rnd);
        card.append(acts);
        grid.append(card);
      });
  });
  w.append(grid);
  $app.append(w);
}

/* ───────────── 错题本 ───────────── *//* ───────────── 错题本 ───────────── *//* ───────────── 错题本 ───────────── *//* ───────────── 错题本 ───────────── */
function wrongRowMeta(r) {
  const parts = [];
  parts.push(r.t > 0 ? '错 ' + r.t + ' 次' : '手动收录');
  if (r.t > 0 && r.pick) parts.push('选了 ' + r.pick);
  if (r.s > 0) parts.push('已连对 ' + r.s + ' 次');
  parts.push(relDays(r.last));
  return parts.join(' · ');
}

function renderWrong() {
  $app.innerHTML = '';
  const w = el('div', 'wrap');
  w.append(el('h2', 'pagetitle', '错题本'));

  const ids = Object.keys(wrongBook).filter(id => BANK.qmap[id]);
  if (!ids.length) {
    w.append(el('div', 'card empty',
      '收录是空的。<br>做题时(无论对错)点「☆ 收录此题」,把值得重做的高价值题收进来;<br>收录不会自动移出,由你手动管理。'));
    $app.append(w);
    return;
  }

  const c = el('div', 'card sec');

  // ── 收录分布:按考点/题型统计 ──
  const stats = {};
  ids.forEach(function (id) {
    const q = BANK.qmap[id];
    const key = q.subject === 'math' ? (q.tag ? plainText(q.tag).split('·')[0] : '未标注考点')
                                     : plainText(q.cat || '未分类');
    (stats[key] = stats[key] || { n: 0, ids: [], subj: q.subject });
    stats[key].n++;
    stats[key].ids.push(id);
  });
  const keys = Object.keys(stats).sort((a, b) => stats[b].n - stats[a].n);
  const maxN = stats[keys[0]].n;

  c.append(el('h2', 'sec-title', '已收录 ' + ids.length + ' 题 · 收录分布'));
  const chart = el('div', 'statchart');
  keys.forEach(function (g) {
    const row = el('button', 'statrow');
    row.title = '点击刷「' + g + '」的收录题';
    row.append(el('span', 'statname', g));
    const barWrap = el('div', 'statbar');
    const bar = el('div', 'statbar-fill');
    bar.style.width = Math.round(stats[g].n / maxN * 100) + '%';
    barWrap.append(bar);
    row.append(barWrap);
    row.append(el('span', 'statn', String(stats[g].n)));
    row.onclick = function () { startIds(stats[g].ids.slice().sort(), '收录 · ' + g, 'redo', '#/wrong'); };
    chart.append(row);
  });
  c.append(chart);

  // ── 科目过滤 ──
  const mathIds = ids.filter(id => BANK.qmap[id].subject === 'math');
  const logicIds = ids.filter(id => BANK.qmap[id].subject === 'logic');
  const tabs = el('div', 'tabs');
  [['all', '全部 ' + ids.length], ['math', '数学 ' + mathIds.length], ['logic', '逻辑 ' + logicIds.length]]
    .forEach(function (pair) {
      const t = el('button', 'tab' + (wrongFilter === pair[0] ? ' active' : ''), pair[1]);
      t.onclick = function () { wrongFilter = pair[0]; render(); };
      tabs.append(t);
    });
  c.append(tabs);

  const filtered = ids.filter(function (id) {
    if (wrongFilter === 'math') return BANK.qmap[id].subject === 'math';
    if (wrongFilter === 'logic') return BANK.qmap[id].subject === 'logic';
    return true;
  }).sort();

  filtered.forEach(function (id) {
    const q = BANK.qmap[id];
    const r = wrongBook[id];
    const row = el('div', 'setrow wrongrow');
    row.append(el('div', 'setname small', qMeta(q)));
    const parts = ['收录 ' + relDays(r.last)];
    if (r.t > 0) parts.push('重做错 ' + r.t + ' 次' + (r.pick ? '(选 ' + r.pick + ')' : ''));
    row.append(el('div', 'setmeta', parts.join(' · ')));
    const redo = el('button', 'btn ghost small', '重做');
    redo.onclick = function () { startIds([id], '收录重做 · ' + subjLabel(q) + '第 ' + q.no + ' 题', 'redo', '#/wrong'); };
    const del = el('button', 'btn ghost small', '×');
    del.title = '从收录移出';
    del.onclick = function () { delete wrongBook[id]; saveWrong(); render(); };
    row.append(redo, del);
    c.append(row);
  });

  const acts = el('div', 'actions');
  const all = el('button', 'btn', '复习全部(' + ids.length + ')');
  all.onclick = function () { startIds(ids.slice().sort(), '收录复习(' + ids.length + ' 题)', 'redo', '#/wrong'); };
  acts.append(all);
  const pdf = el('button', 'btn ghost', '导出打印版 PDF');
  pdf.onclick = function () { exportWrongPDF(); };
  acts.append(pdf);
  const clr = el('button', 'btn ghost', '清空收录');
  clr.onclick = function () {
    if (confirm('确定清空全部收录?')) { wrongBook = {}; wrongFilter = 'all'; saveWrong(); render(); }
  };
  acts.append(clr);
  c.append(acts);
  w.append(c);
  $app.append(w);
}

/* ── 错题本导出打印版(浏览器打印/另存为 PDF) ── */
function buildWrongPrintHTML() {
  const ids = Object.keys(wrongBook).filter(id => BANK.qmap[id]).sort();
  const esc2 = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const strip = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent; };
  let body = '';
  ['math', 'logic'].forEach(function (subj) {
    const list = ids.map(id => BANK.qmap[id]).filter(q => q.subject === subj);
    if (!list.length) return;
    body += '<h2>' + BANK.subjects[subj].label + '（' + list.length + ' 题）</h2>';
    list.forEach(function (q) {
      const r = wrongBook[q.id] || {};
      body += '<div class="q">';
      body += '<div class="qmeta">' + esc2(q.set) + ' · 第 ' + q.no + ' 题 · ' +
        esc2(strip(q.tag || (q.cat ? q.cat + '·' + q.type : ''))) +
        ' ｜ 错 ' + (r.t || 1) + ' 次' + (r.pick ? ' · 曾选 ' + r.pick : (r.star ? ' · 手动收录' : '')) + '</div>';
      body += '<div class="qstem">' + q.stem + '<span class="blank"></span></div>';
      if (q.fig) body += '<img class="qfig" src="' + q.fig + '"/>';
      if (q.kind === 'cond') {
        body += '<div class="cond">(1) ' + q.c1 + '</div><div class="cond">(2) ' + q.c2 + '</div>';
        body += '<div class="condopt">A 条件(1)充分　B 条件(2)充分　C 联合充分　D 都充分　E 都不充分</div>';
      }
      (q.opts || []).forEach(function (o, li) {
        body += '<div class="opt' + (LETTERS[li] === q.ans ? ' okopt' : '') + '"><b>' + LETTERS[li] + '.</b> ' + o + '</div>';
      });
      body += '<div class="ans">【答案】' + q.ans + (q.kind === 'cond' ? '（' + (COND_OPTS[LETTERS.indexOf(q.ans)] || '') + '）' : '') + '</div>';
      if (q.sol) body += '<div class="solprint">' + q.sol + '</div>';
      if (q.trap) body += '<div class="qtrap">' + q.trap + '</div>';
      body += '</div>';
    });
  });
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<title>错题本 · 打印版</title><style>' +
    'body{font-family:"PingFang SC","Hiragino Sans GB","Songti SC","Microsoft YaHei",serif;' +
    'font-size:12.5px;line-height:1.7;color:#111;margin:0;padding:24px 30px}' +
    'h1{text-align:center;font-size:19px;margin:0 0 2px}' +
    '.sub{text-align:center;color:#888;font-size:11px;margin-bottom:18px}' +
    'h2{font-size:15px;border-bottom:2px solid #1c7796;color:#1c7796;padding-bottom:4px;margin:22px 0 10px}' +
    '.q{border:1px solid #ddd;border-radius:8px;padding:10px 14px;margin-bottom:12px;page-break-inside:avoid}' +
    '.qmeta{color:#1c7796;font-size:10.5px;margin-bottom:4px}' +
    '.qstem{font-size:13px;margin-bottom:4px}' +
    '.cond{padding-left:12px;font-size:12px}' +
    '.opt{padding-left:16px}' +
    '.okopt b{color:#2f8f5b}' +
    '.ans{font-weight:700;margin-top:6px}' +
    '.solprint{color:#333}' +
    '.qtrap{color:#a08a4f;font-size:11.5px;margin-top:3px}' +
    '@page{size:A4;margin:14mm 12mm}' +
    '</style></head><body>' +
    '<h1>错题本 · 打印版</h1>' +
    '<div class="sub">共 ' + ids.length + ' 题 · 生成于 ' + new Date().toLocaleDateString('zh-CN') +
    ' · 建议隔 2 天重做,连对两次即划掉</div>' + body + '</body></html>';
}

function exportWrongPDF() {
  const ids = Object.keys(wrongBook).filter(id => BANK.qmap[id]);
  if (!ids.length) { alert('收录是空的'); return; }
  const strip = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent; };
  const items = ids.map(function (id) {
    const q = BANK.qmap[id], r = wrongBook[id] || {};
    return { subject: q.subject, set: q.set, no: q.no, kind: q.kind,
             tag: strip(q.tag || (q.cat ? q.cat + '·' + q.type : '')),
             stem: q.stem, opts: q.opts, c1: q.c1, c2: q.c2,
             ans: q.ans, sol: q.sol || '', trap: q.trap || '',
             t: r.t || 1, pick: r.pick || null };
  });
  const payload = { count: items.length, date: new Date().toLocaleDateString('zh-CN'), items: items };
  fetch('/wrongbook-pdf', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload) })
    .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.blob(); })
    .then(function (blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '错题本_重做版.pdf';
      document.body.append(a); a.click(); a.remove();
    })
    .catch(function () {
      // file:// 直开等无法连服务器时,退回浏览器打印(同样 A4 排版)
      const w = window.open('', '_blank');
      if (!w) { alert('无法连接导出服务,且浏览器拦截了弹窗;请通过本地服务器访问后重试'); return; }
      w.document.open(); w.document.write(buildWrongPrintHTML()); w.document.close();
      setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 400);
    });
}

/* ───────────── 答案速查 ───────────── */
function renderAnswers() {
  $app.innerHTML = '';
  const w = el('div', 'wrap');
  w.append(el('h2', 'pagetitle', '答案速查'));

  const tabs = el('div', 'tabs');
  Object.keys(BANK.subjects).forEach(function (key) {
    const t = el('button', 'tab' + (ansSubj === key ? ' active' : ''), BANK.subjects[key].label);
    t.onclick = function () { ansSubj = key; render(); };
    tabs.append(t);
  });
  w.append(tabs);

  const subj = BANK.subjects[ansSubj];

  // 套卷快速筛选
  const sf = el('div', 'setfilter');
  [['', '全部']].concat(subj.sets.map(function (s) { return [s.name, s.name]; }))
    .forEach(function (pair) {
      const c = el('button', 'fchip' + (ansSetFilter === pair[0] ? ' active' : ''), pair[1]);
      c.onclick = function () { ansSetFilter = pair[0]; render(); };
      sf.append(c);
    });
  w.append(sf);

  if (subj.tongfa && subj.tongfa.length) {
    const tf = el('details', 'card sec');
    tf.append(el('summary', '', '<b>题型通法卡</b><span class="catcnt">先认打法,再看答案</span>'));
    subj.tongfa.forEach(function (tm) {
      const row = el('div', 'setrow');
      row.append(el('div', 'setname small', tm[0]));
      row.append(el('div', 'setmeta grow', tm[1]));
      tf.append(row);
    });
    w.append(tf);
  }
  let lastGroup = null;
  subj.sets.filter(function (s) { return !ansSetFilter || s.name === ansSetFilter; })
    .forEach(function (set) {
      if (!ansSetFilter && set.group !== lastGroup) {
        w.append(el('div', 'grouprow', set.group));
        lastGroup = set.group;
      }
      const c = el('details', 'card sec');
      if (ansSetFilter) c.open = true;
      c.append(el('summary', '', '<b>' + set.name + '</b><span class="catcnt">' + set.qs.length + ' 题 · 点答案卡看解析</span>'));
      const g = el('div', 'ansgrid');
      set.qs.forEach(function (q) {
        const chip = el('button', 'anschip');
        chip.append(el('span', 'a-no', String(q.no)));
        chip.append(el('b', 'a-l', q.ans));
        const tag = shortTag(q);
        if (tag) {
          const ts = el('span', 'a-tag', plainText(tag));
          ts.title = plainText(tag);
          chip.append(ts);
        }
        chip.onclick = function () { openQuestionModal(q); };
        g.append(chip);
      });
      c.append(g);
      w.append(c);
    });
  $app.append(w);
}

/* 答案速查 · 题目详情弹层(只读,不计成绩) */
function openQuestionModal(q) {
  const overlay = el('div', 'modal-overlay');
  const card = el('div', 'modal-card');
  const head = el('div', 'modal-head');
  head.append(el('div', 'modal-title', qMeta(q)));
  const cpBtn = el('button', 'meta-copy', '📋 复制');
  cpBtn.onclick = function () { copyQuestion(q, cpBtn); };
  head.append(cpBtn);
  const x = el('button', 'modal-close', '×');
  x.onclick = function () { overlay.remove(); };
  head.append(x);
  card.append(head);

  const body = el('div', 'modal-body');
  const stem = el('div', 'qstem');
  stem.innerHTML = q.stem + '<span class="blank"></span>';
  body.append(stem);
  if (q.fig) {
    const img = el('img', 'qfig');
    img.src = q.fig;
    body.append(img);
  }
  const grid = el('div', 'optgrid');
  if (q.kind === 'cond') {
    body.append(el('div', 'cond', '(1) ' + q.c1));
    body.append(el('div', 'cond', '(2) ' + q.c2));
    COND_OPTS.forEach(function (txt, li) {
      const b = el('div', 'opt' + (LETTERS[li] === q.ans ? ' ok' : ''));
      b.innerHTML = '<span class="ol">' + LETTERS[li] + '</span><span class="ot">' + txt + '</span>';
      grid.append(b);
    });
  } else {
    (q.opts || []).forEach(function (o, li) {
      const b = el('div', 'opt' + (LETTERS[li] === q.ans ? ' ok' : ''));
      b.innerHTML = '<span class="ol">' + LETTERS[li] + '</span><span class="ot">' + o + '</span>';
      grid.append(b);
    });
  }
  body.append(grid);
  body.append(analysisPanel(q, null));
  card.append(body);
  overlay.append(card);
  overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
  document.body.append(overlay);
}

/* ───────────── 触屏滑动换题 ───────────── */
let tsX = 0, tsY = 0;

function handleSwipe(dx, dy) {
  if (!quiz || quiz.done || quiz.showResult) return false;
  if (location.hash.indexOf('#/quiz') !== 0) return false;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (dx < 0 && quiz.idx < quiz.list.length - 1) { go(quiz.idx + 1); return true; }
    if (dx > 0 && quiz.idx > 0) { go(quiz.idx - 1); return true; }
  }
  return false;
}

document.addEventListener('touchstart', function (e) {
  tsX = e.changedTouches[0].clientX;
  tsY = e.changedTouches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', function (e) {
  handleSwipe(e.changedTouches[0].clientX - tsX, e.changedTouches[0].clientY - tsY);
}, { passive: true });

/* ───────────── 键盘操作 ───────────── */
document.addEventListener('keydown', function (e) {
  if (!quiz || quiz.showResult || location.hash.indexOf('#/quiz') !== 0) return;
  const k = e.key.toUpperCase();
  let li = -1;
  if (k.length === 1 && LETTERS.indexOf(k) >= 0) li = LETTERS.indexOf(k);
  else if (/^[1-5]$/.test(k)) li = +k - 1;
  if (li >= 0) { pick(quiz.idx, li); return; }
  if (e.key === 'ArrowRight' || e.key === 'Enter') { if (quiz.idx < quiz.list.length - 1) go(quiz.idx + 1); }
  else if (e.key === 'ArrowLeft') { go(quiz.idx - 1); }
});

render();
