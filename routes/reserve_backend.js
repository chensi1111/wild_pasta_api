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
  logger.info("/api-backend/reserves", req.body);
  const { pagination, sort,filter } = req.body;
  // 預設排序
  let field = sort?.field || "id";
  let order = (sort?.order || "ASC").toUpperCase();
  // 限制field
  const allowedFields = [
    "id",
    "ord_number",
    "ord_time",
    "name",
    "date",
    "time",
    "people",
    "email",
    "phone_number",
    "status",
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
      if (filter.date) {
        conditions.push(`date = $${paramIndex++}`);
        values.push(filter.date);
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
      `SELECT id,ord_number,ord_time,user_id,name, date, time, people,phone_number,email,status
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
  logger.info("/api-backend/reserves/getOne", req.body);
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
// 可用訂位時間
router.post("/availableTime", async (req, res) => {
  logger.info("/api-backend/reserves/availableTime", req.body);
  let { date } = req.body;
  try {
    const result = await db.query(
      `
        SELECT t.time_slot, t.max_capacity, COALESCE(SUM(r.people), 0) AS reserved
        FROM time_slots_capacity t
        LEFT JOIN reserves r 
        ON r.date = t.date 
        AND r.time BETWEEN (t.time_slot - INTERVAL '1 hour') AND t.time_slot
        WHERE t.date = $1 
        GROUP BY t.time_slot, t.max_capacity
        ORDER BY t.time_slot
      `,
      [date]
    );
    const rows = result.rows;
    res.status(200).json({
      code: response.success,
      msg: "查詢成功",
      data: {
        date,
        rows,
      },
    });
  } catch (error) {
    logger.error(error);
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 更新訂單
router.post("/update", async (req, res) => {
  logger.info("/api-backend/reserves/update", req.body);
  let { id,name,date,people,time,remark,theme,phone_number,email,food_allergy,status } = req.body;
  if(!req.body ||!id||!date ||!time || !people|| !name || !phone_number ||!email || !status) {
    logger.warn("缺少必要資料")
    return sendError(res, response.missing_info, '缺少必要資料');
  }
  const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!dateRegex.test(date)) {
    logger.warn("日期格式錯誤")
    return sendError(res, response.invalid_date, '日期格式錯誤');
  }
  const allowedTimes = ['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'];
  if (!allowedTimes.includes(time)) {
    logger.warn("不符合規範的時間")
    return sendError(res, response.invalid_time, '不符合規範的時間');
  }
  if(people < 1 ) {
    logger.warn("人數錯誤")
    return sendError(res, response.invalid_people, '人數錯誤');
  }
  if(remark && remark.length > 100) {
     logger.warn("備註過長")
     return sendError(res, response.invalid_remark, '備註過長');
  }
  const allowedThemes = ['birthday', 'anniversary', 'business', 'family', 'friends', 'date'];
  if (theme && !allowedThemes.includes(theme)) {
     logger.warn("不符合規範的主題")
     return sendError(res, response.invalid_theme, '不符合規範的主題');
   }
  if(name.length > 20) {
     logger.warn("姓名過長")
     return sendError(res, response.invalid_name, '姓名過長');
   }
  const phoneRegex = /^(09\d{8}|0\d{1,3}-?\d{6,8})$/;    if (!phoneRegex.test(phone_number)) { 
    logger.warn("電話號碼格式錯誤")
     return sendError(res, response.invalid_phone, '電話號碼格式錯誤');
   }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
     logger.warn("Email格式錯誤")
     return sendError(res, response.invalid_email, 'Email格式錯誤');
   }
  if(food_allergy && food_allergy.length > 50) {
     logger.warn("過敏備註過長")
     return sendError(res, response.invalid_allergy, '過敏備註過長');
   }
   const allowedStatus = ['active', 'completed', 'canceled', 'no-show'];
  if (status && !allowedStatus.includes(status)) {
     logger.warn("不符合規範的狀態")
     return sendError(res, response.invalid_status, '不符合規範的狀態');
   }
   const client = await db.connect()
  try {
    const reserveCheck = await client.query(
      "SELECT * FROM reserves WHERE id = $1",
      [id]
    );
    if (reserveCheck.rowCount === 0) {
      logger.warn("找不到該訂位紀錄");
      await client.query('ROLLBACK');
      return sendError(res, response.not_found, "找不到該訂位紀錄");
    }
    const affectedSlots = timeOverlapMap[time];
    const result = await client.query(`
        SELECT t.time_slot, t.max_capacity, COALESCE(SUM(r.people), 0) AS reserved
        FROM time_slots_capacity t
        LEFT JOIN reserves r 
        ON r.date = t.date AND r.time BETWEEN (t.time_slot - INTERVAL '1 hour') AND t.time_slot
        WHERE t.date = $1 AND t.time_slot = ANY($2)
        GROUP BY t.time_slot, t.max_capacity
      `, [date, affectedSlots]);
      const rows = result.rows
      const isOver = rows.some(row => Number(row.reserved) + people > row.max_capacity);
      if (isOver) {
        await client.query('ROLLBACK');
        logger.warn("該時段已額滿，請選擇其他時段")
        return sendError(res, response.empty_capacity, '該時段已額滿，請選擇其他時段');
      }
    await client.query(
      `UPDATE reserves
       SET name=$1, date=$2, people=$3, time=$4, remark=$5,theme=$6, phone_number=$7, email=$8, food_allergy=$9, status=$10
       WHERE id=$11`,
      [name, date, people, time, remark, theme, phone_number, email, food_allergy,status, id]
    );
    return res.status(200).json({
      code: response.success,
      msg: "資料更新成功",
      data: { id },
    });
  } catch (error) {
    logger.error(error);
    await client.query('ROLLBACK');
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }finally {
    client.release()
  }
});
module.exports = router;
