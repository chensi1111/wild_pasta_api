const express = require("express");
const logger = require("../logger");
const response = require("../utils/response_codes");
const router = express.Router();
const db = require("../db");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
dayjs.extend(utc);
function sendError(res, code, msg, data, status = 400) {
  return res.status(status).json({ code, msg, data });
}
// 訂位列表
router.post("/", async (req, res) => {
  logger.info("/api-backend/reservesManage", req.body);
  const { pagination, sort,filter } = req.body;
  // 預設排序
  let field = sort?.field || "id";
  let order = (sort?.order || "ASC").toUpperCase();
  // 限制field
  const allowedFields = [
    "id",
    "date",
    "time_slot",
    "max_capacity",
  ];
  // 限制排序
  if (!["ASC", "DESC"].includes(order)) order = "ASC";
  if (!allowedFields.includes(field)) field = "id";
  const page = pagination?.page || 1;
  const perPage = pagination?.perPage || 10;
  const offset = (page - 1) * perPage;
  const conditions = [];
  const values = [];
  let paramIndex = 1;

    if (filter) {
      // %value%部分相符比對
      if (filter.date) {
        conditions.push(`date = $${paramIndex++}`);
        values.push(filter.date);
      }
      if (filter.time_slot) {
        conditions.push(`time_slot = $${paramIndex++}`);
        values.push(`%${filter.time_slot}%`);
      }
      if (filter.max_capacity) {
        conditions.push(`max_capacity LIKE $${paramIndex++}`);
        values.push(`%${filter.max_capacity}%`);
      }
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await db.query(
      `SELECT id,date,time_slot,max_capacity
      FROM time_slots_capacity
      ${whereClause}
      ORDER BY ${field} ${order}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...values, perPage, offset]
    );

    const rows = result.rows;
    const countResult = await db.query(`SELECT COUNT(*) FROM time_slots_capacity ${whereClause}`,values);
    const total = parseInt(countResult.rows[0].count, 10);

    return res.status(200).json({
      code: response.success,
      msg: "資料獲取成功",
      data: rows,
      total,
    });
  } catch (error) {
    logger.error(error);
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 單獨資訊
router.post("/getOne", async (req, res) => {
  logger.info("/api-backend/reservesManage/getOne", req.body);
  const { id } = req.body;

  try {
    const result = await db.query(
      `SELECT id,date,time_slot,max_capacity
     FROM time_slots_capacity
     WHERE id = $1`,
      [id]
    );

    const rows = result.rows[0];

    return res.status(200).json({
      code: response.success,
      msg: "資料獲取成功",
      data: rows,
    });
  } catch (error) {
    logger.error(error);
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 更新資料
router.post("/update", async (req, res) => {
  logger.info("/api-backend/reservesManage/update", req.body);
  const { id,date,time_slot,max_capacity } = req.body;
  try {
    const result = await db.query(
      `UPDATE time_slots_capacity
       SET 
       date = $1,
       time_slot = $2,
       max_capacity = $3
       WHERE id = $4
       RETURNING *`,
      [date, time_slot, max_capacity, id]
    );

    if (result.rowCount === 0) {
      return sendError(res, response.not_found, "找不到該筆資料");
    }
    return res.status(200).json({
      code: response.success,
      msg: "資料更新成功",
      data: result.rows[0],
    });
  } catch (error) {
    logger.error(error);
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
module.exports = router;
