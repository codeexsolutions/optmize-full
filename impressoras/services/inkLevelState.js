const state = new Map();

function normalize(colors) {
  return [...new Set((colors || []).map(String).filter(Boolean))].sort();
}

function setInkLowColors(machineId, colors) {
  const next = normalize(colors);
  const previous = state.get(machineId) || [];
  const newlyLow = next.filter(color => !previous.includes(color));
  const replenished = previous.filter(color => !next.includes(color));
  state.set(machineId, next);
  return { colors: next, newlyLow, replenished, changed: newlyLow.length > 0 || replenished.length > 0 };
}

function getInkLowColors(machineId) {
  return [...(state.get(machineId) || [])];
}

module.exports = { setInkLowColors, getInkLowColors };
