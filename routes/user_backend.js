const express = require("express");
const logger = require("../logger");
const response = require("../utils/response_codes");
const router = express.Router();
const db = require("../db");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
dayjs.extend(utc);
function sendError(res, code, msg, data, status = 400) {
  return res.status(status).json({ code, msg, data });
}
// 會員資訊
router.post("/", async (req, res) => {
  logger.info("/api-backend/users", req.body);
  const { pagination, sort } = req.body;
  // 預設排序
  let field = sort?.field || "id";
  let order = (sort?.order || "ASC").toUpperCase();
  // 限制field
  const allowedFields = [
    "id",
    "user_id",
    "name",
    "account",
    "email",
    "phone",
    "point",
  ];
  // 限制排序
  if (!["ASC", "DESC"].includes(order)) order = "ASC";
  if (!allowedFields.includes(field)) field = "id";
  const page = pagination?.page || 1;
  const perPage = pagination?.perPage || 10;
  const offset = (page - 1) * perPage;

  try {
    const result = await db.query(
      `SELECT id,user_id,name, account, email, phone, point
     FROM users
      ORDER BY ${field} ${order}
     LIMIT $1 OFFSET $2`,
      [perPage, offset]
    );

    const rows = result.rows;
    const countResult = await db.query(`SELECT COUNT(*) FROM users`);
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
// 單獨會員資訊
router.post("/getOne", async (req, res) => {
  logger.info("/api-backend/users/getOne", req.body);
  const { id } = req.body;

  try {
    const result = await db.query(
      `SELECT id,user_id,name, account, email, phone, point
     FROM users
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
  logger.info("/api-backend/users/update", req.body);
  const { id, user_id, name, phone, email, point } = req.body;
  if (name && name.length > 20) {
    logger.warn("姓名過長");
    return sendError(res, response.invalid_name, "姓名過長");
  }
  if (!name) {
    logger.warn("姓名不得為空");
    return sendError(res, response.invalid_name, "姓名不得為空");
  }
  const phoneRegex = /^(09\d{8}|0\d{1,3}-?\d{6,8})$/;
  if (!phoneRegex.test(phone)) {
    logger.warn("電話號碼格式錯誤");
    return sendError(res, response.invalid_phone, "電話號碼格式錯誤");
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    logger.warn("Email不得為空");
    return sendError(res, response.invalid_email, "Email不得為空");
  }
  if (!emailRegex.test(email)) {
    logger.warn("Email格式錯誤");
    return sendError(res, response.invalid_email, "Email格式錯誤");
  }
  if (!Number.isFinite(Number(point)) || Number(point) < 0) {
    logger.warn("點數錯誤");
    return sendError(res, response.invalid_point, "點數錯誤");
  }
  try {
    const result = await db.query(
      `SELECT name, email, phone, point
     FROM users
     WHERE user_id = $1`,
      [user_id]
    );
    if (result.rowCount === 0) {
      return sendError(res, response.unfound_user, "查無帳號");
    }

    const oldData = result.rows[0];
    const newData = { name, email, phone, point };

    const changedFields = {};
    for (const key in newData) {
      if (newData[key] !== undefined && newData[key] !== oldData[key]) {
        changedFields[key] = newData[key];
      }
    }
    if (Object.keys(changedFields).length === 0) {
      return res.json({
        code: "000",
        msg: "資料未變更",
        data: { id, ...oldData },
      });
    }
    if (changedFields.name !== undefined) {
      await db.query(
        `UPDATE users 
            SET name = $1
             WHERE user_id = $2`,
        [name, user_id]
      );
    }
    if (changedFields.email !== undefined) {
      await db.query(
        `UPDATE users 
            SET email = $1
             WHERE user_id = $2`,
        [email, user_id]
      );
    }
    if (changedFields.phone !== undefined) {
      await db.query(
        `UPDATE users 
            SET phone = $1
             WHERE user_id = $2`,
        [phone, user_id]
      );
    }
    if (changedFields.point !== undefined) {
      const diff = point - oldData.point;
      let editType;
      if (diff > 0) {
        editType = "adminPlus";
      } else if (diff < 0) {
        editType = "adminMinus";
      }
      await db.query(
        `UPDATE users 
       SET point = $1
       WHERE user_id = $2`,
        [Number(point), user_id]
      );
      const currentTime = dayjs().toISOString();
      await db.query(
        `INSERT INTO points (user_id, ord_number, ord_time, point, action,create_time) VALUES ($1, $2, $3, $4, $5, $6)`,
        [user_id, null, null, diff, editType, currentTime]
      );
    }

    return res.status(200).json({
      code: response.success,
      msg: "資料更新成功",
      data: { id, ...oldData, ...changedFields },
    });
  } catch (error) {
    logger.error(error);
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 新增會員
router.post("/create", async (req, res) => {
  logger.info("/api-backend/users/create", req.body);
  let { account, password, email, name,phone } = req.body;

  if (name.length > 20) {
    logger.warn("姓名過長")
    return sendError(res, response.invalid_name, "姓名過長");
  }

  const accountRegex = /^[a-zA-Z0-9_]{4,20}$/;
  if (!accountRegex.test(account)) {
    logger.warn("帳號格式錯誤")
    return sendError(res, response.invalid_account, "帳號格式錯誤");
  }

  const passwordRegex = /^(?=.*[A-Za-z]).{8,}$/;
  if (!passwordRegex.test(password)) {
    logger.warn("密碼格式錯誤")
    return sendError(res, response.invalid_password, "密碼格式錯誤");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    logger.warn("Email格式錯誤")
    return sendError(res, response.invalid_email, "Email格式錯誤");
  }
  const phoneRegex = /^(09\d{8}|0\d{1,3}-?\d{6,8})$/;
  if (phone && !phoneRegex.test(phone)) {
    logger.warn("電話號碼格式錯誤");
    return sendError(res, response.invalid_phone, "電話號碼格式錯誤");
  }

  try {
    const result = await db.query(
      "SELECT account, email FROM users WHERE account = $1 OR email = $2",
      [account, email]
    );
    const rows = result.rows
    for (const row of rows) {
      if (row.account === account) {
        logger.warn("帳號已被使用")
        return sendError(res, response.account_conflict, "帳號已被使用");
      }
      if (row.email === email) {
        logger.warn("信箱已被使用")
        return sendError(res, response.email_conflict, "信箱已被使用");
      }
    }
    const userId = uuidv4();
    // 將密碼用hash處理
    const hashedPassword = await bcrypt.hash(password, 12);

    const insertResult = await db.query(
      `INSERT INTO users (user_id, account, password, email, name, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [userId, account, hashedPassword, email, name, phone]
    );
    
    const newUser = insertResult.rows[0];
    res.status(200).json({
      code: response.success,
      msg: "新增成功",
      data:{
        id: newUser.id,
    }
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 刪除會員
router.post("/delete", async (req, res) => {
  logger.info("/api-backend/users/delete", req.body);
  let { user_id } = req.body;
  if (!user_id) {
    logger.warn("缺少使用者id");
    return sendError(res, response.missing_info, "缺少使用者id");
  }
  try {
    const result = await db.query("DELETE FROM users WHERE user_id = $1 RETURNING *", [user_id]);
    if (result.rowCount === 0) {
      logger.warn("找不到指定用戶");
      return sendError(res, response.not_found, "找不到指定用戶");
    }
    await db.query("DELETE FROM points WHERE user_id = $1",[user_id])
    res.status(201).json({
      code: response.success,
      msg: "刪除成功",
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 批量刪除會員
router.post("/deleteMany", async (req, res) => {
  logger.info("/api-backend/users/deleteMany", req.body);
  const { ids } = req.body;

  if (!ids || !ids.length) {
    logger.warn("缺少使用者id");
    return sendError(res, response.missing_info, "缺少使用者id");
  }

  try {
    // 刪除會員並返回被刪除的 user_id
    const result = await db.query(
    "DELETE FROM users WHERE id = ANY($1::int[]) RETURNING *;",
    [ids]
    );

    if (result.rowCount === 0) {
      logger.warn("找不到指定用戶");
      return sendError(res, response.not_found, "找不到指定用戶");
    }

    const deletedUserIds = result.rows.map(row => row.user_id);

    // 使用被刪除的 user_id 批量刪除點數紀錄
    await db.query(
      "DELETE FROM points WHERE user_id = ANY($1::uuid[])",
      [deletedUserIds]
    );

    res.status(200).json({
      code: response.success,
      msg: "刪除成功"
    });
  } catch (error) {
    logger.error(error);
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
module.exports = router;
