const express = require("express");
const { loadMachines } = require("../config");
const { getSettings, saveSettings, isReady } = require("../whatsapp/settings");
const client = require("../whatsapp/client");
const { sendCustom, notifierStatus } = require("../whatsapp/notifier");

const router = express.Router();

function fail(res, error) {
  res.status(500).json({ error: error.message });
}

router.get("/settings", async (_req, res) => {
  try {
    const machines = await loadMachines();
    res.json({
      settings: getSettings(),
      ready: isReady(),
      machines: machines.map(m => ({ id: m.id, name: m.name }))
    });
  } catch (error) {
    fail(res, error);
  }
});

router.put("/settings", (req, res) => {
  const body = req.body || {};
  const patch = {};

  for (const key of ["groupId", "groupName"]) {
    if (typeof body[key] === "string") patch[key] = body[key];
  }
  for (const key of ["enabled", "notifyStart", "notifyFinish", "notifyError"]) {
    if (typeof body[key] === "boolean") patch[key] = body[key];
  }
  if (Array.isArray(body.machines)) patch.machines = body.machines;

  try {
    res.json({ settings: saveSettings(patch), ready: isReady() });
  } catch (error) {
    fail(res, error);
  }
});

// Sobe o cliente (abre o Chrome invisível). Não espera ficar pronto: o QR
// aparece alguns segundos depois e a tela busca por GET /status, que também
// entrega cada QR novo conforme o WhatsApp vai renovando.
router.post("/connect", (_req, res) => {
  try {
    res.json(client.start());
  } catch (error) {
    fail(res, error);
  }
});

router.get("/status", (_req, res) => {
  res.json({ ...client.getStatus(), ready: isReady(), notifier: notifierStatus() });
});

router.get("/groups", async (_req, res) => {
  try {
    res.json(await client.getGroups());
  } catch (error) {
    fail(res, error);
  }
});

router.post("/logout", async (_req, res) => {
  try {
    await client.logout();
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/test", async (req, res) => {
  const text = typeof req.body?.text === "string" && req.body.text.trim()
    ? req.body.text.trim()
    : "🖨️ *Sublime* — teste de conexão.\nSe você está lendo isso, os avisos de impressão vão chegar aqui.";

  try {
    await sendCustom(text);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

module.exports = router;
