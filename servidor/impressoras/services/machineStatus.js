const status = new Map();

function setStatus(machineId, online, error = null) {
  status.set(machineId, { online, error, checkedAt: Date.now() });
}

function getStatus(machineId) {
  return status.get(machineId) || { online: false, error: "Ainda não verificada", checkedAt: 0 };
}

module.exports = { setStatus, getStatus };
