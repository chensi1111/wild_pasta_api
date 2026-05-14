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
const timeOverlapMap = {
  '11:00': ['11:00', '11:30', '12:00'],
  '11:30': ['11:30', '12:00', '12:30'],
  '12:00': ['12:00', '12:30', '13:00'],
  '12:30': ['12:30', '13:00', '13:30'],
  '13:00': ['13:00', '13:30', '14:00'],
  '13:30': ['13:30', '14:00'],
  '14:00': ['14:00'],
  '17:00': ['17:00', '17:30', '18:00'],
  '17:30': ['17:30', '18:00', '18:30'],
  '18:00': ['18:00', '18:30', '19:00'],
  '18:30': ['18:30', '19:00', '19:30'],
  '19:00': ['19:00', '19:30', '20:00'],
  '19:30': ['19:30', '20:00'],
  '20:00': ['20:00'],
};
// 訂位列表
router.post("/", async (req, res) => {
  logger.info("/api-backend/reservesToday", req.body);
  const { pagination, sort,filter } = req.body;
  // 預設排序
  let field = sort?.field || "id";
  let order = (sort?.order || "ASC").toUpperCase();
  // 限制field
  const allowedFields = [
    "ord_number",
    "name",
    "time",
    "people",
    "theme",
    "remark",
    "food_allergy",
    "status",
    "phone_number"
  ];
  // 限制排序
  if (!["ASC", "DESC"].includes(order)) order = "ASC";
  if (!allowedFields.includes(field)) field = "ord_number";
  const page = pagination?.page || 1;
  const perPage = pagination?.perPage || 10;
  const offset = (page - 1) * perPage;
  const conditions = [];
  const values = [];
  let paramIndex = 1;

    if (filter) {
      // ILIKE不區分大小寫
      // %value%部分相符比對
      if (filter.ord_number) {
        conditions.push(`ord_number ILIKE $${paramIndex++}`);
        values.push(`%${filter.ord_number}%`);
      }
      if (filter.name) {
        conditions.push(`name ILIKE $${paramIndex++}`);
        values.push(`%${filter.name}%`);
      }
      if (filter.phone_number) {
        conditions.push(`phone_number ILIKE $${paramIndex++}`);
        values.push(`%${filter.phone_number}%`);
      }
      if (filter.time) {
        conditions.push(`time = $${paramIndex++}`);
        values.push(`%${filter.time}%`);
      }
      if (filter.status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(filter.status);
      }
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  try {
    const result = await db.query(
      `SELECT id,ord_number,name, date, time, people,phone_number,theme,remark,food_allergy,status
      FROM reserves
      ${whereClause}
      ORDER BY ${field} ${order}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...values, perPage, offset]
    );

    const rows = result.rows;
    const countResult = await db.query(`SELECT COUNT(*) FROM reserves ${whereClause}`,values);
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
// 單一訂位詳情
router.post("/getOne", async (req, res) => {
  logger.info("/api-backend/reservesToday/getOne", req.body);
  const { id } = req.body;

  try {
    const result = await db.query(
      `SELECT id,ord_number,ord_time,user_id,name, date, time, people, remark,theme,phone_number,email,food_allergy,status,cancel_time
     FROM reserves
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
module.exports = router;