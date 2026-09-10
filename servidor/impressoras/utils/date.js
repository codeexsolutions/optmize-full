function localIsoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeRange(start, end) {
  const today = localIsoDate();
  const s = /^\d{4}-\d{2}-\d{2}$/.test(start || "") ? start : today;
  const e = /^\d{4}-\d{2}-\d{2}$/.test(end || "") ? end : s;
  return s <= e ? { start: s, end: e } : { start: e, end: s };
}

function addDays(iso, days) {
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return localIsoDate(dt);
}

function enumerateDays(start, end) {
  const out = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function brDate(iso) {
  if (!iso) return "";
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Segunda a domingo da semana que contém a data informada (formato local,
// sem UTC, pra bater com o resto do app).
function weekBounds(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay(); // 0=domingo ... 6=sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = localIsoDate(new Date(y, m - 1, d + diffToMonday));
  const end = addDays(start, 6);
  return { start, end };
}

module.exports = { localIsoDate, normalizeRange, addDays, enumerateDays, brDate, weekBounds };
