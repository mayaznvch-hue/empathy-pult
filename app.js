/* Пульт Эмпатии — 5 инструментов, без сервера и без паролей. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d };
const daysTo = iso => Math.round((new Date(iso + "T00:00:00") - today()) / 864e5);
const fmtDate = iso => iso ? new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "—";
const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const m = n % 10; return n > 10 && n < 20 ? c : m > 1 && m < 5 ? b : m === 1 ? a : c };
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text) } catch { const t = document.createElement("textarea"); t.value = text; document.body.append(t); t.select(); document.execCommand("copy"); t.remove() }
  if (btn) { const o = btn.textContent; btn.textContent = "Скопировано ✓"; setTimeout(() => btn.textContent = o, 1500) }
}
function download(name, text, type = "text/plain") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- тема и вкладки ---------- */
const themeSel = $("#theme");
themeSel.value = LS.get("theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
const applyTheme = () => { document.documentElement.dataset.theme = themeSel.value; LS.set("theme", themeSel.value) };
themeSel.onchange = applyTheme; applyTheme();
function openTab(id) {
  $$("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === id));
  $$(".pane").forEach(p => p.classList.toggle("on", p.id === id));
  if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
}
$$("#tabs button").forEach(b => b.onclick = () => openTab(b.dataset.tab));
if (location.hash && $(location.hash + ".pane")) openTab(location.hash.slice(1));

/* ---------- данные от GitHub Actions ---------- */
let HEALTH = null, STAFF = null;
async function loadData() {
  const get = async f => { try { const r = await fetch("data/" + f + "?t=" + Date.now()); return r.ok ? r.json() : null } catch { return null } };
  [HEALTH, STAFF] = await Promise.all([get("health.json"), get("staff.json")]);
  $("#stamp").textContent = HEALTH ? "проверено " + HEALTH.checked_at : "нет данных проверки";
  renderDead(); renderHealth(); renderSverka(); renderFired();
}

/* =====================================================
   1. СРОКИ
   ===================================================== */
const DEFAULT_DEADLINES = [
  { id: "bitrix", title: "Лицензия 1С-Битрикс (empathycenter.ru)", date: "2026-12-01", kind: "Лицензия", note: "Без продления не будет обновлений и техподдержки, сайт продолжит работать" },
  { id: "akciya", title: "Акция «Лучшая цена»: снять или продлить", date: "2026-11-28", kind: "Акция", note: "empathycenter.ru" },
];
const getDead = () => LS.get("deadlines", null) ?? (LS.set("deadlines", DEFAULT_DEADLINES), DEFAULT_DEADLINES);
function autoDeadlines() {
  if (!HEALTH) return [];
  const out = [];
  for (const s of HEALTH.sites) {
    if (s.domain_reg?.paid_till) out.push({ id: "dom-" + s.domain, title: "Домен " + s.domain, date: s.domain_reg.paid_till, kind: "Домен", note: "Регистратор " + (s.domain_reg.registrar || "") + " · автоматически", auto: 1 });
    if (s.ssl?.until) out.push({ id: "ssl-" + s.domain, title: "SSL-сертификат " + s.domain, date: s.ssl.until, kind: "SSL", note: (s.ssl.issuer || "") + (/Let's Encrypt/i.test(s.ssl.issuer) ? " · обычно продлевается сам" : " · проверить, кто продлевает") + " · автоматически", auto: 1 });
  }
  return out;
}
function renderDead() {
  const all = [...getDead(), ...autoDeadlines()].sort((a, b) => a.date.localeCompare(b.date));
  $("#deadList").innerHTML = all.map(d => {
    const n = daysTo(d.date), cls = n < 0 ? "bad gone" : n <= 14 ? "bad" : n <= 45 ? "warn" : "";
    const label = n < 0 ? "прошло" : n === 0 ? "сегодня" : plural(n, "день", "дня", "дней");
    return `<div class="item ${cls}"><div class="days">${n === 0 ? "!" : Math.abs(n)}<small>${label}</small></div>
      <div class="body"><b>${esc(d.title)}</b><span><span class="tag">${esc(d.kind)}</span>до ${fmtDate(d.date)}${d.cost ? " · " + esc(d.cost) + " ₽" : ""}${d.note ? " · " + esc(d.note) : ""}</span></div>
      ${d.auto ? "" : `<button class="x" title="Удалить" data-del="${esc(d.id)}">×</button>`}</div>`;
  }).join("") || '<p class="muted">Пока пусто.</p>';
  $$("[data-del]").forEach(b => b.onclick = () => { if (confirm("Удалить этот срок?")) { LS.set("deadlines", getDead().filter(x => x.id !== b.dataset.del)); renderDead() } });
}
$("#deadForm").onsubmit = e => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
  LS.set("deadlines", [...getDead(), { id: "u" + Date.now(), ...f }]); e.target.reset(); e.target.closest("details").open = false; renderDead();
};
$("#expBtn").onclick = () => download("pult-sroki.json", JSON.stringify(getDead(), null, 1), "application/json");
$("#impFile").onchange = async e => {
  try { const d = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(d)) throw 0; LS.set("deadlines", d); renderDead(); alert("Загружено: " + d.length) } catch { alert("Это не файл копии пульта") }
};
$("#icsBtn").onclick = () => {
  const all = [...getDead(), ...autoDeadlines()].filter(d => daysTo(d.date) >= 0);
  const ymd = s => s.replaceAll("-", ""), stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const alarm = d => `BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Напоминание\r\nTRIGGER:-P${d}D\r\nEND:VALARM\r\n`;
  const ev = all.map(d => { const end = new Date(d.date + "T00:00:00"); end.setDate(end.getDate() + 1);
    return `BEGIN:VEVENT\r\nUID:${d.id}@empathy-pult\r\nDTSTAMP:${stamp}\r\nDTSTART;VALUE=DATE:${ymd(d.date)}\r\nDTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replaceAll("-", "")}\r\nSUMMARY:Эмпатия: ${d.title.replace(/[,;]/g, " ")}\r\nDESCRIPTION:${(d.note || "").replace(/[,;\n]/g, " ")}\r\n${alarm(14)}${alarm(3)}${alarm(1)}END:VEVENT\r\n` }).join("");
  download("empathy-sroki.ics", `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Empathy Pult//RU\r\nCALSCALE:GREGORIAN\r\n${ev}END:VCALENDAR\r\n`, "text/calendar");
};

/* =====================================================
   2. АНКЕТА → HTML
   ===================================================== */
async function unzipEntry(buf, name) {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let e = buf.byteLength - 22; while (e > 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  let p = v.getUint32(e + 16, true); const n = v.getUint16(e + 10, true), dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), fl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const fname = dec.decode(u8.subarray(p + 46, p + 46 + fl));
    if (fname === name) {
      const ds = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true), data = u8.subarray(ds, ds + csize);
      if (method === 0) return dec.decode(data);
      const s = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return await new Response(s).text();
    }
    p += 46 + fl + xl + cl;
  }
  throw new Error("В файле нет " + name);
}
function docxRows(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml"), W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const txt = p => [...p.getElementsByTagNameNS(W, "t")].map(t => t.textContent).join("");
  return [...doc.getElementsByTagNameNS(W, "tr")].map(tr => [...tr.getElementsByTagNameNS(W, "tc")].map(tc => [...tc.getElementsByTagNameNS(W, "p")].map(txt).filter(s => s.trim()).map(s => s.trim())));
}
const BRANCHES = {
  "1028": { addr: "г. Москва, ул. Малая Семеновская, д. 10 (м. «Электрозаводская»)", keys: /семен|семён|электрозав|бауман/i },
  "3681": { addr: "г. Москва, Проспект Вернадского, д. 15 (м. «Университет»)", keys: /вернадск|университет/i },
  "188": { addr: "Московская область, г. Реутов, Юбилейный проспект, д. 8 (м. «Новокосино»)", keys: /реутов|новокосино|юбилейн/i },
};
function parseAnketa(rows) {
  const a = { edu: [], courses: [], jobs: [] }; let sect = "", cur = null;
  const val = r => (r[1] || []).join("\n").trim().replace(/^[-–—]$/, "");
  for (const r of rows) {
    const label = (r[0] || []).join(" ").trim(), v = val(r), L = label.toLowerCase();
    if (r.length === 1 || (!r[1] && /образование|курсы|научные|опыт работы|места работы|присутствие/i.test(label))) { sect = L; continue }
    if (L === "фио") a.fio = v; else if (L.startsWith("специализац")) a.spec = v;
    else if (L.startsWith("заболевания")) a.problems = (r[1] || []);
    else if (L.startsWith("принимает детей")) a.kids = v;
    else if (L.startsWith("с какими разновид")) a.notWork = (r[1] || []);
    else if (L.startsWith("амбулаторный")) a.branches = v;
    else if (L.startsWith("есть ли онлайн")) a.online = v;
    else if (L.startsWith("стоимость")) a.price = v;
    else if (L.startsWith("выезд")) a.home = v;
    else if (L.startsWith("год начала")) a.since = v;
    else if (L === "квалификация") a.qual = v; else if (L === "звание") a.title = v; else if (L.startsWith("ученая") || L.startsWith("учёная")) a.degree = v;
    else if (sect.includes("образование")) {
      if (L.startsWith("начало")) { cur = { years: v }; a.edu.push(cur) }
      else if (cur) { if (L.startsWith("тип")) cur.type = v; else if (L.startsWith("учебное")) cur.school = v; else if (L.startsWith("факультет")) cur.fac = v; else if (L.startsWith("специальн")) cur.spec = v }
    } else if (sect.includes("курсы")) {
      if (/начало/.test(L)) { cur = { years: v }; a.courses.push(cur) }
      else if (cur) { if (/учебное/.test(L)) cur.school = v; else if (/назван/.test(L)) cur.name = v }
    } else if (sect.includes("места работы")) {
      if (/город/.test(L)) { cur = { city: v }; a.jobs.push(cur) }
      else if (cur) { if (/организ/.test(L)) cur.org = v; else if (/должн/.test(L)) cur.pos = v; else if (/период/.test(L)) cur.period = v }
    }
  }
  a.edu = a.edu.filter(e => e.school); a.courses = a.courses.filter(c => c.school || c.name); a.jobs = a.jobs.filter(j => j.org);
  return a;
}
const lastYear = s => (String(s || "").match(/(19|20)\d\d/g) || []).pop() || "";
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
function problemsHtml(list) {
  return (list || []).flatMap(p => p.split(/(?<=[.)])\s*(?=[А-ЯЁ][а-яё])/)).map(s => s.trim()).filter(Boolean).map(p => {
    const m = p.match(/^([^:]{3,90}):\s*(.*)$/);
    return m ? `<p>\n\t<b>${esc(m[1].trim())}:</b> ${esc(m[2].trim())}\n</p>` : `<p>\n\t<b>${esc(p)}</b>\n</p>`;
  }).join("\n");
}
function ageText(kids) {
  const k = (kids || "").toLowerCase(); const n = (k.match(/(\d{1,2})\s*(лет|год)/) || [])[1];
  if (/не принима/.test(k)) return `Врач принимает пациентов в возрасте ${n || 18} лет и старше.`;
  if (n) return `Врач принимает пациентов в возрасте от ${n} ${plural(+n, "года", "лет", "лет")}.`;
  return kids ? cap(kids) : "";
}
function notWorkText(list) {
  const items = (list || []).map(s => s.replace(/^[-–—•\s]+/, "").replace(/[,;.\s]+$/, "")).filter(s => s && !/^не работаю( с пациентами)?:?$/i.test(s));
  return items.length ? `<b>Специалист не работает</b> с пациентами: ${esc(items.join(", "))}.` : "";
}
function buildHtml(a, links, about) {
  const fio = a.fio || "ФИО", specWord = /психотерап/i.test(a.spec) ? "Врач-психотерапевт" : /психолог/i.test(a.spec) ? "Психолог" : /невролог/i.test(a.spec) ? "Врач-невролог" : "Врач-психиатр";
  const brs = Object.entries(BRANCHES).filter(([, b]) => b.keys.test(a.branches || ""));
  const online = /^да|есть/i.test(a.online || "");
  const lk = (id, text) => `<!--noindex--><a href="${esc(links[id] || "ВСТАВИТЬ ССЫЛКУ")}" rel="nofollow" data-original-title="Форма записи на консультацию в центр откроется в новом окне" title="Форма записи откроется в новом окне" target="_blank"><b>${text}</b></a><!--/noindex-->`;
  let h = "";
  const age = ageText(a.kids); if (age) h += `<div class="alert alert-success">\n\t${esc(age)}\n</div>\n`;
  h += `<h5>С какими проблемами можно обратиться?</h5>\n${problemsHtml(a.problems)}\n`;
  const nw = notWorkText(a.notWork); if (nw) h += `<div class="alert alert-danger">\n\t${nw}\n</div>\n`;
  h += `<h5>Где принимает?</h5>\n`;
  if (brs.length) {
    h += `<p>\n\t${specWord} ${esc(fio)} ведет очный прием в центре «Эмпатия» по адрес${brs.length > 1 ? "ам" : "у"}:\n</p>\n<ul>\n`;
    h += brs.map(([id, b]) => `\t<li><a href="/contacts/${id}/">${esc(b.addr)}</a> - ${lk("br" + id, "ЗАПИСАТЬСЯ")}</li>`).join("\n") + "\n</ul>\n";
  }
  if (online) h += `<p>\n\t${brs.length ? "также можно" : "Можно"} ${lk("online", "").replace("<b></b>", "записаться к специалисту на <b>онлайн-консультацию</b>")}.\n</p>\n`;
  h += `<h5>О специалисте</h5>\n${(about || "ВСТАВИТЬ ТЕКСТ «О СПЕЦИАЛИСТЕ»").split(/\n\s*\n|\n/).filter(s => s.trim()).map(p => `<p>\n\t${esc(p.trim())}\n</p>`).join("\n")}\n<hr>\n`;
  h += `<div class="tabs">\n\t<ul class="nav nav-tabs">\n\t\t<li class="active"> <a class="shadow1" href="#education" data-toggle="tab">Образование</a> </li>\n`;
  if (a.courses.length) h += `\t\t<li> <a class="shadow1 experience-tab" href="#courses" data-toggle="tab">Курсы повышения</a></li>\n`;
  if (a.jobs.length) h += `\t\t<li> <a class="shadow1 experience-tab" href="#experience" data-toggle="tab">Опыт работы</a></li>\n`;
  h += `\t</ul>\n</div>\n<div class="tab-content">\n\t<div class="tab-pane active" id="education">\n`;
  h += a.edu.map(e => `\t\t<p>\n\t\t\t<u><b>${esc(lastYear(e.years))}</b></u><br>\n\t\t</p>\n\t\t<p>\n\t\t\t<b>${esc(e.school)}</b><br>\n\t\t\t<i>${esc(cap(e.type || ""))}${e.spec || e.fac ? " (" + esc((e.spec || e.fac).toLowerCase()) + ")" : ""}</i>\n\t\t</p>`).join("\n") + "\n\t</div>\n";
  if (a.courses.length) h += `\t<div class="tab-pane experience-tab" id="courses">\n` + a.courses.map(c => `\t\t<p>\n\t\t\t${c.years ? `<u><b>${esc(lastYear(c.years))}</b></u><br>\n\t\t\t` : ""}<b>${esc(c.school || "")}</b><br>\n\t\t\t<i>${esc(c.name || "")}</i>\n\t\t</p>`).join("\n") + "\n\t</div>\n";
  if (a.jobs.length) h += `\t<div class="tab-pane experience-tab" id="experience">\n` + a.jobs.map(j => `\t\t<p>\n\t\t\t<u><b>${esc(j.period || "")}</b></u><br>\n\t\t\t<b>${esc(j.org)}</b>${j.city ? ", " + esc(j.city) : ""}<br>\n\t\t\t<i>${esc(j.pos || "")}</i>\n\t\t</p>`).join("\n") + "\n\t</div>\n";
  h += `</div>\n`;
  return h;
}
const translit = s => s.toLowerCase().split("").map(c => ({ а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", " ": "-" }[c] ?? (/[a-z0-9-]/.test(c) ? c : ""))).join("").replace(/-+/g, "-").replace(/^-|-$/g, "");
let ANK = null;
function ankRender() {
  if (!ANK) return;
  const a = ANK, links = {}; $$("#ankLinks input").forEach(i => links[i.name] = i.value.trim());
  const about = $("#ankAbout")?.value || "";
  ["fio", "kids", "branches", "online", "price"].forEach(k => { const i = $(`#ankForm [name=${k}]`); if (i) a[k] = i.value });
  a.problems = ($("#ankForm [name=problems]")?.value || "").split("\n").filter(s => s.trim());
  a.notWork = ($("#ankForm [name=notWork]")?.value || "").split("\n").filter(s => s.trim());
  const html = buildHtml(a, links, about);
  $("#ankOut").value = html; $("#ankPrev").innerHTML = html;
  const w = [];
  if (!about.trim()) w.push("Нет текста «О специалисте» — в анкете его нет, напиши 3–4 абзаца в поле слева.");
  if (/ВСТАВИТЬ ССЫЛКУ/.test(html)) w.push("Не все ссылки на запись вставлены.");
  if (!Object.values(BRANCHES).some(b => b.keys.test(a.branches || "")) && !/^да|есть/i.test(a.online || "")) w.push("Не понял филиал: напиши в поле «Филиалы» Семёновская / Вернадского (Университет) / Реутов.");
  $("#ankWarn").innerHTML = w.map(esc).join("<br>");
  const code = translit((a.fio || "").split(/\s+/).slice(0, 3).join(" "));
  const sec = /психотерап/i.test(a.spec) ? "Психотерапевты" : /дет/i.test(a.kids || "") && !/не принима/i.test(a.kids) ? "Психиатры + Детские психиатры" : "Психиатры";
  const meta = { "Название": a.fio, "Символьный код": code, "Раздел": sec, "Стоимость приёма": a.price ? a.price + " ₽" : "—", "Онлайн": a.online || "—", "Выезд на дом": a.home || "—", "Стаж с": a.since || "—" };
  $("#ankMeta").innerHTML = Object.entries(meta).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}${k === "Символьный код" || k === "Название" ? ` <button data-cp="${esc(v)}">копия</button>` : ""}</dd>`).join("");
  $$("#ankMeta [data-cp]").forEach(b => b.onclick = () => copy(b.dataset.cp, b));
}
async function ankLoad(file) {
  try {
    const xml = await unzipEntry(await file.arrayBuffer(), "word/document.xml");
    ANK = parseAnketa(docxRows(xml));
    if (!ANK.fio) throw new Error("Не нашёл ФИО — это точно анкета специалиста?");
  } catch (e) { alert("Не получилось прочитать файл: " + e.message); return }
  const a = ANK, f = (name, label, v, area) => `<label class="${area ? "wide" : ""}">${label}${area ? `<textarea name="${name}" rows="5">${esc(v)}</textarea>` : `<input name="${name}" value="${esc(v)}">`}</label>`;
  $("#ankForm").innerHTML = f("fio", "ФИО", a.fio) + f("price", "Стоимость, ₽", a.price || "") + f("kids", "Возраст пациентов", a.kids || "") + f("online", "Онлайн-приём", a.online || "") +
    f("branches", "Филиалы", a.branches || "") + "<span></span>" + f("problems", "С какими проблемами (строка = абзац, «Группа: список»)", (a.problems || []).join("\n"), 1) +
    f("notWork", "Не работает с (строка = пункт)", (a.notWork || []).join("\n"), 1) +
    `<label class="wide">О специалисте (в анкете этого нет — пишешь сама, абзацы через Enter)<textarea id="ankAbout" rows="6" placeholder="Анастасия Юрьевна Абашкина — врач-психиатр…"></textarea></label>`;
  const brs = Object.entries(BRANCHES);
  $("#ankLinks").innerHTML = brs.map(([id, b]) => `<label class="wide">${esc(b.addr.split(",").slice(1, 3).join(","))}<input name="br${id}" placeholder="https://app2.sqns.ru/booking/booking?orgid=…#/combo/…"></label>`).join("") +
    `<label class="wide">Онлайн-консультация<input name="online" placeholder="https://app2.sqns.ru/booking/booking?orgid=8153#/combo/…"></label>`;
  $("#ankWork").hidden = false;
  $$("#ankWork input, #ankWork textarea:not(#ankOut)").forEach(i => i.oninput = ankRender);
  ankRender();
}
const drop = $("#drop");
$("#docx").onchange = e => e.target.files[0] && ankLoad(e.target.files[0]);
["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over") }));
["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("over") }));
drop.addEventListener("drop", e => e.dataTransfer.files[0] && ankLoad(e.dataTransfer.files[0]));
$("#copyHtml").onclick = e => copy($("#ankOut").value, e.target);
$("#dlHtml").onclick = () => download(translit(ANK?.fio || "vrach") + ".html", $("#ankOut").value, "text/html");

/* =====================================================
   3. ЗДОРОВЬЕ САЙТОВ
   ===================================================== */
const stCls = s => s === 200 || s === 301 ? "st-ok" : s >= 300 && s < 400 ? "st-warn" : "st-bad";
function renderHealth() {
  if (!HEALTH) { $("#hStamp").textContent = "Данных пока нет."; return }
  const ago = Math.round((Date.now() - new Date(HEALTH.checked_at.replace(" ", "T") + ":00+03:00")) / 6e4);
  $("#hStamp").textContent = `Последняя автоматическая проверка: ${HEALTH.checked_at} (мск), ${ago < 60 ? ago + " мин" : Math.round(ago / 60) + " ч"} назад. Проверка идёт сама каждые 3 часа.`;
  $("#hSites").innerHTML = HEALTH.sites.map(s => {
    const ok = s.status === 200, sd = s.ssl?.until ? daysTo(s.ssl.until) : null, dd = s.domain_reg?.paid_till ? daysTo(s.domain_reg.paid_till) : null;
    const lvl = n => n == null ? "" : n < 14 ? "bad" : n < 30 ? "warn" : "";
    return `<div class="tile" data-site="${s.domain}"><div><span class="dot ${ok ? "" : "bad"}"></span><b>${s.domain}</b></div>
      <div class="big ${ok ? "st-ok" : "st-bad"}">${ok ? "работает" : "НЕ ОТКРЫВАЕТСЯ (" + (s.status || "нет ответа") + ")"}</div>
      <div class="small muted">ответ за ${s.ms} мс · <span class="live"></span></div>
      <div class="small"><span class="dot ${lvl(sd)}"></span>SSL до ${fmtDate(s.ssl?.until)}${sd != null ? ` (${sd} дн.)` : ""}</div>
      <div class="small"><span class="dot ${lvl(dd)}"></span>Домен до ${fmtDate(s.domain_reg?.paid_till)}${dd != null ? ` (${dd} дн.)` : ""}</div></div>`;
  }).join("");
  $("#hPages").innerHTML = HEALTH.pages.map(p => `<tr><td class="${stCls(p.status)}">${p.status}</td><td><a href="https://empathycenter.ru${p.path}" target="_blank">${p.path}</a> <span class="muted">${p.ms} мс</span></td></tr>`).join("");
  $("#hRedir").innerHTML = HEALTH.redirects.map(r => `<tr><td class="${r.status === 301 ? "st-ok" : "st-bad"}">${r.status}</td><td>${esc(r.path)}<br><span class="muted">→ ${esc(r.to || "переадресации нет!")}</span></td></tr>`).join("");
  const sm = HEALTH.sitemap, badFiles = sm.files.filter(f => f.status !== 200);
  $("#hMap").innerHTML = `<p>Всего адресов в карте сайта: <b>${sm.total}</b> в ${sm.files.length} файлах.${badFiles.length ? ` <span class="st-bad">Не открываются: ${badFiles.map(f => f.file).join(", ")}</span>` : ""}</p>` +
    (sm.fired_in_sitemap.length ? `<p class="st-bad">В карте сайта остались адреса уволенных: ${sm.fired_in_sitemap.map(esc).join(", ")}. Выключи их карточки в админке и пересоздай карту.</p>` : `<p class="st-ok">Адресов уволенных в карте сайта нет ✓</p>`);
}
$("#pingBtn").onclick = async () => {
  for (const t of $$("#hSites .tile")) {
    const el = $(".live", t), t0 = performance.now(); el.textContent = "проверяю…";
    try { await fetch("https://" + t.dataset.site + "/?ping=" + Date.now(), { mode: "no-cors", cache: "no-store" }); el.innerHTML = `<span class="st-ok">сейчас открывается (${Math.round(performance.now() - t0)} мс)</span>` }
    catch { el.innerHTML = `<span class="st-bad">сейчас не открывается с этого устройства</span>` }
  }
};

/* =====================================================
   4. СВЕРКА ВРАЧЕЙ
   ===================================================== */
const norm = s => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
function renderSverka() {
  if (!STAFF) return;
  const main = STAFF.main, mainN = new Set(main.map(m => norm(m.name))), land = STAFF.landing, landN = new Set(land.map(norm));
  const ign = new Set(LS.get("svIgnore", ["кузьмина мария дмитриевна"]));
  const onlyLand = land.filter(n => !mainN.has(norm(n)) && !ign.has(norm(n)));
  const psy = main.filter(m => m.sections.some(s => /^психиатр$/i.test(s)));
  const onlyMain = psy.filter(m => !landN.has(norm(m.name)) && !ign.has(norm(m.name)));
  $("#svTiles").innerHTML = `<div class="tile"><div class="big">${land.length}</div>врачей на лендинге</div>
    <div class="tile"><div class="big">${main.length}</div>специалистов на основном сайте (психиатров: ${psy.length})</div>
    <div class="tile"><div class="big ${onlyLand.length || onlyMain.length ? "st-warn" : "st-ok"}">${onlyLand.length + onlyMain.length}</div>расхождений</div>`;
  const hide = n => ` <button class="x small" title="Не показывать (так и задумано)" data-ign="${esc(norm(n))}">скрыть</button>`;
  $("#svOnlyLand").innerHTML = onlyLand.map(n => `<li>${esc(n)}${hide(n)}</li>`).join("") || '<li class="st-ok">Нет — всё совпадает ✓</li>';
  $("#svOnlyMain").innerHTML = onlyMain.map(m => `<li><a href="https://empathycenter.ru${m.url}" target="_blank">${esc(m.name)}</a>${hide(m.name)}</li>`).join("") || '<li class="st-ok">Нет — все психиатры есть на лендинге ✓</li>';
  $$("[data-ign]").forEach(b => b.onclick = () => { LS.set("svIgnore", [...ign, b.dataset.ign]); renderSverka() });
  $("#svIgnInfo").innerHTML = ign.size ? `Скрыто как «так и задумано»: ${[...ign].map(esc).join(", ")}. <a href="#" id="svReset">Показать всех</a>` : "";
  const rs = $("#svReset"); if (rs) rs.onclick = e => { e.preventDefault(); LS.set("svIgnore", []); renderSverka() };
  const by = {}; main.forEach(m => m.sections.forEach(s => (by[s] ||= []).push(m)));
  $("#svAll").innerHTML = Object.entries(by).sort((a, b) => b[1].length - a[1].length).map(([s, l]) => `<h3>${esc(s)} — ${l.length}</h3><ul class="names">${l.map(m => `<li><a href="https://empathycenter.ru${m.url}" target="_blank">${esc(m.name)}</a>${landN.has(norm(m.name)) ? ' <span class="tag">на лендинге</span>' : ""}</li>`).join("")}</ul>`).join("");
}

/* =====================================================
   5. УВОЛЕННЫЙ ВРАЧ
   ===================================================== */
function renderFired() {
  const q = $("#frName").value.trim(), urls = STAFF?.sitemap_staff_urls || [];
  if (!q) { $("#frFound").innerHTML = '<li class="muted">Введи фамилию…</li>'; $("#frOut").value = ""; return }
  const t = translit(q).split("-")[0], low = q.toLowerCase();
  let codes = new Set();
  (STAFF?.main || []).forEach(m => { if (norm(m.name).includes(norm(q))) codes.add(m.url.split("/").filter(Boolean).pop()) });
  if (/^[a-z0-9-]+$/.test(low)) codes.add(low);
  if (!codes.size && t.length >= 3) codes.add(t);
  const found = urls.filter(u => [...codes].some(c => u.split("/").some(seg => seg === c || seg.startsWith(c + "-") || seg.startsWith(c.split("-")[0] + "-") && c.length > 3 && seg.includes(c.split("-")[0]))));
  const extra = [...codes].filter(c => !found.some(u => u.includes("/" + c + "/"))).map(c => `/staff/psychiatrists/${c}/`);
  const all = [...new Set([...found, ...extra])].sort();
  const done = new Set((HEALTH?.redirects || []).filter(r => r.status === 301).map(r => r.path));
  $("#frFound").innerHTML = all.length ? all.map(u => `<li>${esc(u)}${done.has(u) ? ' <span class="tag st-ok">уже переадресован</span>' : found.includes(u) ? "" : ' <span class="tag">нет в карте сайта — проверь вручную</span>'}</li>`).join("") : '<li class="st-warn">Ничего не нашёл. Введи часть адреса страницы врача латиницей, например <code>boyko</code>.</li>';
  const to = $("#frTo").value;
  $("#frOut").value = all.filter(u => !done.has(u)).map(u => `Redirect 301 ${u} ${to}`).join("\n");
}
$("#frName").oninput = renderFired; $("#frTo").onchange = renderFired;
$("#frCopy").onclick = e => copy($("#frOut").value, e.target);

loadData();
