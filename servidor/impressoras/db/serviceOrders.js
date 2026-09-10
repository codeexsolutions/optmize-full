const crypto = require("crypto");
const db = require("../../db");

const insertOrderStmt = db.prepare(`
  INSERT INTO imp_service_orders
    (id, clientName, fabric, printSize, meters, printerOperator, machine, date, observation, createdAt)
  VALUES
    (@id, @clientName, @fabric, @printSize, @meters, @printerOperator, @machine, @date, @observation, @createdAt)
`);

const insertImageStmt = db.prepare(`
  INSERT INTO imp_service_order_images (id, orderId, fileName, mimeType, position, isBlouse, quantity, data)
  VALUES (@id, @orderId, @fileName, @mimeType, @position, @isBlouse, @quantity, @data)
`);

function imageQuantity(meta) {
  if (!meta || !meta.isBlouse) return null;
  const q = Number(meta.quantity);
  return meta.quantity !== undefined && meta.quantity !== null && meta.quantity !== "" && !Number.isNaN(q) ? q : null;
}

const createOrder = db.transaction((fields, images, imagesMeta = []) => {
  const id = crypto.randomUUID();
  insertOrderStmt.run({
    id,
    clientName: fields.clientName,
    fabric: fields.fabric || "",
    printSize: fields.printSize || "",
    meters: fields.meters ?? null,
    printerOperator: fields.printerOperator || "",
    machine: fields.machine || "",
    date: fields.date,
    observation: fields.observation || "",
    createdAt: Date.now()
  });

  images.forEach((file, index) => {
    const meta = imagesMeta[index] || {};
    insertImageStmt.run({
      id: crypto.randomUUID(),
      orderId: id,
      fileName: file.originalname || "",
      mimeType: file.mimetype,
      position: index,
      isBlouse: meta.isBlouse ? 1 : 0,
      quantity: imageQuantity(meta),
      data: file.buffer
    });
  });

  return id;
});

const updateOrderStmt = db.prepare(`
  UPDATE imp_service_orders SET
    clientName=@clientName, fabric=@fabric, printSize=@printSize, meters=@meters,
    printerOperator=@printerOperator, machine=@machine, date=@date, observation=@observation
  WHERE id=@id
`);

const deleteImageStmt = db.prepare(`DELETE FROM imp_service_order_images WHERE id = ? AND orderId = ?`);
const maxImagePositionStmt = db.prepare(`SELECT COALESCE(MAX(position),-1) AS maxPos FROM imp_service_order_images WHERE orderId = ?`);
const updateImageMetaStmt = db.prepare(`
  UPDATE imp_service_order_images SET isBlouse=@isBlouse, quantity=@quantity WHERE id=@id AND orderId=@orderId
`);

const updateOrder = db.transaction((id, fields, newImages, removeImageIds, newImagesMeta = [], existingImageUpdates = []) => {
  const existing = db.prepare(`SELECT id FROM imp_service_orders WHERE id = ?`).get(id);
  if (!existing) return false;

  updateOrderStmt.run({
    id,
    clientName: fields.clientName,
    fabric: fields.fabric || "",
    printSize: fields.printSize || "",
    meters: fields.meters ?? null,
    printerOperator: fields.printerOperator || "",
    machine: fields.machine || "",
    date: fields.date,
    observation: fields.observation || ""
  });

  (removeImageIds || []).forEach(imageId => deleteImageStmt.run(imageId, id));

  (existingImageUpdates || []).forEach(meta => {
    updateImageMetaStmt.run({
      id: meta.id,
      orderId: id,
      isBlouse: meta.isBlouse ? 1 : 0,
      quantity: imageQuantity(meta)
    });
  });

  let position = maxImagePositionStmt.get(id).maxPos + 1;
  newImages.forEach((file, index) => {
    const meta = newImagesMeta[index] || {};
    insertImageStmt.run({
      id: crypto.randomUUID(),
      orderId: id,
      fileName: file.originalname || "",
      mimeType: file.mimetype,
      position: position++,
      isBlouse: meta.isBlouse ? 1 : 0,
      quantity: imageQuantity(meta),
      data: file.buffer
    });
  });

  return true;
});

function listOrders({ start, end, q } = {}) {
  const conditions = [];
  const params = {};

  if (start) { conditions.push("date >= @start"); params.start = start; }
  if (end) { conditions.push("date <= @end"); params.end = end; }
  if (q) { conditions.push("(clientName LIKE @q OR fabric LIKE @q)"); params.q = `%${q}%`; }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  return db.prepare(`
    SELECT
      o.*,
      (SELECT COUNT(*) FROM imp_service_order_images i WHERE i.orderId = o.id) AS imageCount,
      (SELECT i.id FROM imp_service_order_images i WHERE i.orderId = o.id ORDER BY i.position LIMIT 1) AS coverImageId
    FROM imp_service_orders o
    ${where}
    ORDER BY o.date DESC, o.createdAt DESC
  `).all(params);
}

function getOrder(id) {
  const order = db.prepare(`SELECT * FROM imp_service_orders WHERE id = ?`).get(id);
  if (!order) return null;

  const images = db.prepare(`
    SELECT id, fileName, mimeType, position, isBlouse, quantity
    FROM imp_service_order_images
    WHERE orderId = ?
    ORDER BY position
  `).all(id).map(img => ({ ...img, isBlouse: !!img.isBlouse }));

  return { ...order, images };
}

function getImage(orderId, imageId) {
  return db.prepare(`
    SELECT data, mimeType FROM imp_service_order_images WHERE orderId = ? AND id = ?
  `).get(orderId, imageId);
}

function deleteOrder(id) {
  const result = db.prepare(`DELETE FROM imp_service_orders WHERE id = ?`).run(id);
  return result.changes > 0;
}

module.exports = { createOrder, updateOrder, listOrders, getOrder, getImage, deleteOrder };
