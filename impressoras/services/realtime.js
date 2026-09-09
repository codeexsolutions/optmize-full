const { machineSignature, readMachineRange } = require("../sources");
const { localIsoDate } = require("../utils/date");
const { upsertMany } = require("../db/records");
const { setStatus } = require("./machineStatus");
const { readPrinter2InkSnapshot, printer2InkDelta } = require("../sources/printer2InkStats");
const { setInkLowColors } = require("./inkLevelState");

const PAUSE_AFTER_MS = Number(process.env.AT_PROGRESS_PAUSE_MS || 15000);

// Estado por máquina, fora da closure de startRealtime para que
// getActiveAtProgress() (usado pelo botão "Atualizar" do painel ao vivo)
// consiga ler o snapshot atual mesmo sem esperar o próximo evento mudar.
const state = new Map();

function startRealtime(io, loadMachines) {
  let running = false;

  function emitAtProgress(machine, record, previousRecord = null, suppressStartNotification = false) {
    const changed =
      !previousRecord ||
      Number(previousRecord.finish || 0) !== Number(record.finish || 0) ||
      Number(previousRecord.total || 0) !== Number(record.total || 0) ||
      Number(previousRecord.printLength || 0) !== Number(record.printLength || 0) ||
      Number(previousRecord.timeSeconds || 0) !== Number(record.timeSeconds || 0) ||
      String(previousRecord.status || "") !== String(record.status || "");

    if (!changed) return;

    io.emit("print-progress", {
      ...record,
      machineId: machine.id,
      machineName: machine.name,
      progressPercent: Number(record.progressPercent || 0),
      progressState: record.progressState || "unknown",
      suppressStartNotification,
      progressAt: Date.now()
    });
  }

  async function tick() {
    if (running) return;
    running = true;

    try {
      let machines = [];
      try {
        machines = await loadMachines();
      } catch {
        return;
      }

      for (const machine of machines) {
        try {
          const sig = await machineSignature(machine);
          const prev = state.get(machine.id);
          const today = localIsoDate();

          // Primeira leitura: cria baseline sem notificar trabalhos antigos.
          if (!prev || prev.online === false) {
            const records = await readMachineRange(machine, today, today);
            if (machine.type === "xml") {
              setInkLowColors(machine.id, records[0]?.inkLowColors || []);
            }
            const inkSnapshot = machine.type === "csv"
              ? await readPrinter2InkSnapshot(machine).catch(error => {
                  console.warn(`[printer2-ink] ${machine.id}: ${error.message}`);
                  return null;
                })
              : null;
            upsertMany(records);
            setStatus(machine.id, true);
            state.set(machine.id, {
              sig,
              ids: new Set(records.map(r => r.id)),
              records: new Map(records.map(r => [r.id, r])),
              initialActiveIds: new Set(records.filter(r => r.progressState === "printing").map(r => r.id)),
              lastProgressAt: new Map(),
              machineName: machine.name,
              machineType: machine.type,
              online: true
              ,inkSnapshot
            });

            io.emit("machine-status", {
              machineId: machine.id,
              machineName: machine.name,
              online: true
            });

            continue;
          }

          if (prev.sig !== sig) {
            const records = await readMachineRange(machine, today, today);
            const ids = new Set(records.map(r => r.id));
            const newOnes = records.filter(r => !prev.ids.has(r.id));

            if (machine.type === "xml" && newOnes.length) {
              for (const record of [...newOnes].sort((a, b) => a.dateTime.localeCompare(b.dateTime))) {
                const level = setInkLowColors(machine.id, record.inkLowColors || []);
                if (level.changed) {
                  io.emit("ink-level-status", {
                    machineId: machine.id,
                    machineName: machine.name,
                    colors: level.colors,
                    replenished: level.replenished,
                    at: Date.now()
                  });
                }
                if (level.newlyLow.length) {
                  io.emit("ink-level-alert", {
                    machineId: machine.id,
                    machineName: machine.name,
                    colors: level.colors,
                    newlyLow: level.newlyLow,
                    at: Date.now()
                  });
                }
              }
            }

            let inkSnapshot = prev.inkSnapshot || null;
            if (machine.type === "csv" && newOnes.length) {
              const currentInk = await readPrinter2InkSnapshot(machine).catch(error => {
                console.warn(`[printer2-ink] ${machine.id}: ${error.message}`);
                return null;
              });
              const ink = printer2InkDelta(inkSnapshot, currentInk);
              if (ink && newOnes.length === 1) {
                newOnes[0].inkMl = ink.totalMl;
                newOnes[0].inkChannels = ink.channels;
                newOnes[0].inkExperimental = false;
                console.log(`[printer2-ink] ${machine.id}: ${ink.totalMl} mL em "${newOnes[0].task}" (K/C/M/Y exatos).`);
              } else if (ink && newOnes.length > 1) {
                // O CSV raramente acrescenta mais de uma linha entre duas
                // leituras. Se acontecer, distribui somente para não atribuir
                // todo o contador a um único trabalho e mantém a marca de
                // estimado na divisão individual.
                const weights = newOnes.map(r => Math.max(0, Number(r.printArea || r.timeSeconds || 0)));
                const weightTotal = weights.reduce((sum, value) => sum + value, 0) || newOnes.length;
                newOnes.forEach((record, index) => {
                  const ratio = weightTotal ? (weights[index] || 1) / weightTotal : 1 / newOnes.length;
                  record.inkChannels = ink.channels.map(channel => ({ ...channel, ml: channel.ml * ratio }));
                  record.inkMl = record.inkChannels.reduce((sum, channel) => sum + channel.ml, 0);
                  record.inkExperimental = true;
                });
              }
              if (currentInk) inkSnapshot = currentInk;
            }

            upsertMany(records);
            setStatus(machine.id, true);
            const recordMap = new Map(records.map(r => [r.id, r]));

            io.emit("history-updated", {
              machineId: machine.id,
              machineName: machine.name,
              count: newOnes.length,
              at: Date.now()
            });

            if (machine.type === "at-binary") {
              // Máquinas 06/07: atualizam o mesmo registro durante a impressão.
              for (const record of records) {
                const previousRecord = prev.records.get(record.id);
                const wasActiveAtStartup = prev.initialActiveIds && prev.initialActiveIds.has(record.id);
                emitAtProgress(machine, record, previousRecord, wasActiveAtStartup);
                if (record.progressState !== "printing" && prev.initialActiveIds) {
                  prev.initialActiveIds.delete(record.id);
                }
              }
            } else {
              // XML/CSV: registro novo normalmente já representa trabalho finalizado.
              newOnes
                .filter(r => !r.cancelled && !r.error)
                .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
                .forEach(record => {
                  if (machine.type === "csv" && machine.liveLogFile) {
                    io.emit("print-progress", {
                      ...record,
                      id: `${machine.id}|live`,
                      progressPercent: 100,
                      progressState: "completed",
                      progressMode: "indeterminate",
                      progressAt: Date.now()
                    });
                  }
                  io.emit("new-print", {
                    ...record,
                    notificationMode: "immediate"
                  });
                });
            }

            state.set(machine.id, {
              sig,
              ids,
              records: recordMap,
              initialActiveIds: prev.initialActiveIds || new Set(),
              machineName: machine.name,
              machineType: machine.type,
              online: true
              ,inkSnapshot
            });
          }
        } catch (error) {
          const prev = state.get(machine.id);
          setStatus(machine.id, false, error.message);

          if (!prev || prev.online !== false) {
            io.emit("machine-status", {
              machineId: machine.id,
              machineName: machine.name,
              online: false,
              error: error.message
            });
          }

          state.set(machine.id, {
            ...(prev || {}),
            online: false
          });
        }
      }
    } finally {
      running = false;
    }
  }

  setInterval(tick, 1500);
  tick();
}

// Snapshot dos trabalhos das máquinas AT (06/07) que estão "printing" agora,
// direto do último estado conhecido — sem precisar esperar o próximo evento
// de mudança. Usado pelo botão "Atualizar" do painel Impressões ao vivo.
function getActiveAtProgress() {
  const out = [];
  for (const [machineId, entry] of state.entries()) {
    if (!entry || entry.machineType !== "at-binary" || !entry.records) continue;
    for (const record of entry.records.values()) {
      if (record.progressState !== "printing") continue;
      out.push({
        ...record,
        machineId,
        machineName: entry.machineName || machineId,
        progressPercent: Number(record.progressPercent || 0),
        progressState: record.progressState,
        progressAt: Date.now()
      });
    }
  }
  return out;
}

module.exports = { startRealtime, getActiveAtProgress };
