const express = require('express');
const logger=require('../logger');
const router = express.Router();
const db =require('../db')
const response=require('../utils/response_codes')
const dayjs = require("dayjs")
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

function sendError(res, code, msg, status = 400) {
  return res.status(status).json({ code, msg });
}

// 取得容量設定
router.post("/getOne", async (req, res) => {
  logger.info("/api-backend/systemCapacity/getOne");
  try {
    const result = await db.query(`SELECT id,dafault_reserve_max_capacity,default_takeout_capacity FROM system_config`);
    res.status(200).json({
      code: response.success,
      msg: '更新成功',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, '伺服器錯誤，請稍後再試', 500);
  }
});
// 更新容量
router.post("/update", async (req, res) => {
  logger.info("/api-backend/systemCapacity/update");
  const { dafault_reserve_max_capacity,default_takeout_capacity } = req.body;
  try {
    const result = await db.query(
      `UPDATE system_config
       SET 
       dafault_reserve_max_capacity = $1,
       default_takeout_capacity = $2
       WHERE id = $3
       RETURNING *`,
      [dafault_reserve_max_capacity, default_takeout_capacity, 1]
    );
    res.status(200).json({
      code: response.success,
      msg: '更新成功',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, '伺服器錯誤，請稍後再試', 500);
  }
});
module.exports = router;