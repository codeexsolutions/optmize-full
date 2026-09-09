const path = require("path");
const express = require("express");
const multer = require("multer");
const { createOrder, updateOrder, listOrders, getOrder, getImage, deleteOrder } = require("../db/serviceOrders");
const { buildOrderPdf } = require("../services/orderPdf");

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".svg", ".webp", ".tif", ".tiff"]);
const MIME_BY_EXT = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".tif": "image/tiff", ".tiff": "image/tiff"
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 12 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new Error("Formato de imagem não aceito. Use JPG, PNG, SVG, WEBP ou TIF."));
    }
    if (!file.mimetype || file.mimetype === "application/octet-stream") {
      file.mimetype = MIME_BY_EXT[ext];
    }
    cb(null, true);
  }
});

const router = express.Router();

router.get("/", (req, res) => {
  try {
    const { start, end, q } = req.query;
    const orders = listOrders({ start: start || null, end: end || null, q: q ? String(q) : null });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", (req, res) => {
  try {
    const order = getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "OS não encontrada" });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id/image/:imageId", (req, res) => {
  try {
    const image = getImage(req.params.id, req.params.imageId);
    if (!image) return res.status(404).send("Imagem não encontrada");
    res.setHeader("Content-Type", image.mimeType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(image.data);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

router.get("/:id/pdf", async (req, res) => {
  try {
    const doc = await buildOrderPdf(req.params.id);
    if (!doc) return res.status(404).send("OS não encontrada");

    const order = getOrder(req.params.id);
    const safeName = (order.clientName || "OS")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "OS";
    const filename = `OS-${safeName}-${order.date}.pdf`;
    const download = req.query.download === "1";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${filename}"`);
    doc.pipe(res);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

function readOrderFields(body) {
  const { clientName, fabric, printSize, meters, printerOperator, machine, date, observation } = body;
  return { clientName, fabric, printSize, meters, printerOperator, machine, date, observation };
}

function validateOrderFields(fields) {
  if (!fields.clientName || !String(fields.clientName).trim()) return "Nome do cliente é obrigatório";
  if (!fields.date || !/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) return "Data inválida";
  return null;
}

function parseJsonField(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return undefined; }
}

router.post("/", (req, res) => {
  upload.array("images", 12)(req, res, error => {
    if (error) return res.status(400).json({ error: error.message });

    const fields = readOrderFields(req.body);
    const validationError = validateOrderFields(fields);
    if (validationError) return res.status(400).json({ error: validationError });

    const imagesMeta = parseJsonField(req.body.imagesMeta, []);
    if (imagesMeta === undefined) return res.status(400).json({ error: "imagesMeta inválido" });

    try {
      const id = createOrder({
        ...fields,
        clientName: String(fields.clientName).trim(),
        meters: fields.meters !== undefined && fields.meters !== "" ? Number(fields.meters) : null
      }, req.files || [], imagesMeta);

      res.status(201).json(getOrder(id));
    } catch (dbError) {
      res.status(500).json({ error: dbError.message });
    }
  });
});

router.put("/:id", (req, res) => {
  upload.array("images", 12)(req, res, error => {
    if (error) return res.status(400).json({ error: error.message });

    const fields = readOrderFields(req.body);
    const validationError = validateOrderFields(fields);
    if (validationError) return res.status(400).json({ error: validationError });

    const removeImageIds = parseJsonField(req.body.removeImageIds, []);
    const newImagesMeta = parseJsonField(req.body.imagesMeta, []);
    const existingImageUpdates = parseJsonField(req.body.existingImageUpdates, []);
    if (removeImageIds === undefined || newImagesMeta === undefined || existingImageUpdates === undefined) {
      return res.status(400).json({ error: "Metadados de imagem inválidos" });
    }

    try {
      const updated = updateOrder(req.params.id, {
        ...fields,
        clientName: String(fields.clientName).trim(),
        meters: fields.meters !== undefined && fields.meters !== "" ? Number(fields.meters) : null
      }, req.files || [], removeImageIds, newImagesMeta, existingImageUpdates);

      if (!updated) return res.status(404).json({ error: "OS não encontrada" });
      res.json(getOrder(req.params.id));
    } catch (dbError) {
      res.status(500).json({ error: dbError.message });
    }
  });
});

router.delete("/:id", (req, res) => {
  try {
    const removed = deleteOrder(req.params.id);
    if (!removed) return res.status(404).json({ error: "OS não encontrada" });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
