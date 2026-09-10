function blankSummary() {
  return {
    jobs: 0,
    completed: 0,
    cancelled: 0,
    errors: 0,
    printLength: 0,
    printArea: 0,
    timeSeconds: 0,
    inkMl: 0
  };
}

function summarize(records) {
  const s = blankSummary();

  for (const r of records) {
    s.jobs++;
    if (r.cancelled) s.cancelled++;
    else if (r.error) s.errors++;
    else s.completed++;

    if (!r.cancelled && !r.error) {
      s.printLength += Number(r.printLength || 0);
      s.printArea += Number(r.printArea || 0);
      s.timeSeconds += Number(r.timeSeconds || 0);
      s.inkMl += Number(r.inkMl || 0);
    }
  }

  return s;
}

function mergeSummaries(items) {
  return items.reduce((acc, s) => {
    for (const key of Object.keys(acc)) acc[key] += Number(s[key] || 0);
    return acc;
  }, blankSummary());
}

module.exports = { summarize, mergeSummaries, blankSummary };
