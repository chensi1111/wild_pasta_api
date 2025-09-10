const express = require('express');
const logger = require('../logger')
const db =require('../db')
const { randomUUID } = require('crypto');
const response=require('../utils/response_codes')
const router = express.Router(); 
const verifyToken = require("../middleware/auth");
const {generateCancelToken} = require('../utils/token')
const {getThemeList} = require('../utils/translateMap')
const sendEmail = require("../utils/sendEmail");
const dayjs = require("dayjs")
const formatDate = (dateString) => {
    return dayjs(dateString).format('YYYY/MM/DD HH:mm:ss');
};

function sendError(res, code, msg, status = 400) {
  return res.status(status).json({ code, msg });
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
// 訂位
router.post('/',verifyToken, async(req, res) => {
  /* 	
  #swagger.tags = ['reserve']
  #swagger.summary = '預約訂位'
  #swagger.security = [{
    "BearerAuth": []
  }] 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["name","date","time","people","phone_number","email"],
                properties: {
                    name: {
                      type: "string",
                      example: "小明"
                    },
                    date: {
                      type: "string",
                      example: "2025-09-05"
                    },
                    time: {
                      type: "string",
                      example: "19:00"
                    },
                    theme: {
                      type: "string",
                      example: "family"
                    },
                    people: {
                      type: "number",
                      example: 4
                    },
                    remark: {
                      type: "string",
                      example: "bbbb"
                    },
                    food_allergy: {
                      type: "string",
                      example: "ssss"
                    },
                    phone_number: {
                      type: "string",
                      example: "0912345678"
                    },
                    email: {
                      type: "string",
                      example: "chensitest4832@gmail.com"
                    },
                }
            }
        }
    }
  }
  #swagger.responses[200] = {
    description: "成功",
     content: {
          "application/json": {
              example: {
                  code: "000",
                  msg: "成功",
                  data: ""
              }
          }
      }
  } 
*/
    logger.info('/api/reserve',req.body)
    const {userId} = req.user;
    const { date, time, people, remark, theme, name, phone_number, email, food_allergy } = req.body;
    if(!req.body ||!userId||!date ||!time || !people|| !name || !phone_number) {
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
    if(people < 1 || people > 12) {
      logger.warn("人數錯誤")
      return sendError(res, response.invalid_people, '人數錯誤');
    }
    if (remark && remark.length > 100) {
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
    const phoneRegex = /^(09\d{8}|0\d{1,3}-?\d{6,8})$/;
    if (!phoneRegex.test(phone_number)) {
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
    // 產生訂單號碼
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const randomPart = randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase(); 
    const ord_number = `ORD${year}${month}${day}-${randomPart}`;
    const affectedSlots = timeOverlapMap[time];
    // 下單時間
    const ord_time = new Date().toISOString()

    // 取消訂單token
    const cancel_token = generateCancelToken()
    const orderTime = dayjs(`${date} ${time}`, 'YYYY-MM-DD HH:mm');
    const cancel_expired = orderTime.add(-30, 'minute').toISOString();
    const client = await db.connect()
    try {
      const result = await client.query(`
        SELECT t.time_slot, t.max_capacity, COALESCE(SUM(r.people), 0) AS reserved
        FROM time_slots_capacity t
        LEFT JOIN reserves r 
        ON r.date = t.date AND r.time <= t.time_slot AND (r.time + INTERVAL '1 hour 30 minutes') > t.time_slot
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
      const status = "active"
      await client.query(
      'INSERT INTO reserves (ord_number,ord_time,user_id, date,time,people,remark,theme,name,phone_number,email,food_allergy,cancel_token,cancel_expired,status) VALUES ( $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
      [ord_number,ord_time,userId, date, time, people, remark, theme, name, phone_number, email, food_allergy, cancel_token, cancel_expired, status]
    );
    await sendEmail(
      email,
      "Wild Pasta 預約成功",
      `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fafafa; border-radius: 8px; border: 1px solid #eaeaea;">
        <div style="text-align: center; padding-bottom: 10px; border-bottom: 2px solid #333;">
          <h1 style="color: #333; margin: 0; font-size: 28px;">Wild Pasta</h1>
          <p style="color: #666; margin: 4px 0 0;">感謝您的預約！</p>
        </div>
    
        <div style="padding: 20px 0;">
          <h2 style="color: #333; font-size: 20px;">預約資訊</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">訂單編號</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold; color: #333;">${ord_number}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">下單時間</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #333;">${formatDate(ord_time)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">姓名</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #333;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">預約日期</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #333;">${date}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">預約時間</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #333;">${time}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">預約人數</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #333;">${people}</td>
            </tr>
            ${
              theme
                ? `
                  <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">主題</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #333;">${getThemeList(theme)}</td>
                  </tr>
                `
                : ""
            }
          </table>
        </div>
        ${
          remark
            ? `
          <div style="margin-top: 15px; padding: 12px; background-color: rgb(255, 255, 255); border-radius: 6px; border: 1px solid rgb(230, 230, 230);">
            <p style="margin: 0; color: #333;">備註：${remark}</p>
          </div>
          `
            : ""
        }
        ${
          food_allergy
            ? `
          <div style="margin-top: 15px; padding: 12px; background-color: rgb(255, 255, 255); border-radius: 6px; border: 1px solid rgb(230, 230, 230);">
            <p style="margin: 0; color: #333;">過敏食物：${food_allergy}</p>
          </div>
          `
            : ""
        }
        <div style="margin-top: 15px; padding: 12px; background-color: rgb(255, 255, 255); border-radius: 6px; border: 1px solid rgb(230, 230, 230);">
            <a href="http://localhost:5184/cancel-order?ORDToken=${cancel_token}" style="margin: 0; color: #333">點擊取消訂單</a>
            <p style="margin: 5px 0 0 0; color: #d9534f;font-size:12px">預約時間前30分鐘不可取消</p>
          </div>
        <div style="margin-top: 25px; text-align: center; padding-top: 10px; border-top: 1px solid #eaeaea;">
          <p style="margin: 0; font-size: 14px; color: #999;">感謝您選擇 Wild Pasta</p>
          <p style="margin: 4px 0 0; font-size: 14px; color: #999;">如有問題，請聯絡我們：<a href="mailto:chensiProjectTest4832@gmail.com" style="color: #333; text-decoration: none;">chensiProjectTest4832@gmail.com</a></p>
        </div>
      </div>
      `
    );
    await client.query('COMMIT');
    res.status(200).json({
      code: response.success,
      msg: '訂位成功',
    });
    } catch (error) {
      logger.error(error)
      await client.query('ROLLBACK');
      return sendError(res, response.server_error, '伺服器錯誤，請稍後再試', 500);
    } finally {
        client.release();
      }
  });
// 查詢日期
router.post('/date',async(req, res) => {
    /* 	
  #swagger.tags = ['reserve']
  #swagger.summary = '查詢可用時間' 

  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["date"],
                properties: {
                    date: {
                        type: "string",
                        example: "2025-09-08"
                    }
                }
            }
        }
    }
  }
  #swagger.responses[200] = {
    description: "成功",
    content: {
        "application/json": {
            example: {
                code: "000",
                msg: "成功",
                data: {
                    today: "2025-09-08",
                    rows:[{max_capacity:48,reserved:"0",time_slot:"11:00:00"},{max_capacity:48,reserved:"0",time_slot:"11:30:00"}]
                }
            }
        }
    }
  } 
*/
    logger.info('/api/reserve/date',req.body) 
    let { date } = req.body;
    try {
        const result = await db.query(`
        SELECT t.time_slot, t.max_capacity, COALESCE(SUM(r.people), 0) AS reserved
        FROM time_slots_capacity t
        LEFT JOIN reserves r 
        ON r.date = t.date 
        AND r.time <= t.time_slot
        AND (r.time + INTERVAL '1 hour 30 minutes') > t.time_slot
        WHERE t.date = $1 
        GROUP BY t.time_slot, t.max_capacity
        ORDER BY t.time_slot
      `, [date]);
      const rows = result.rows
      res.status(200).json({
        code: response.success,
        msg: '查詢成功',
        data: {
            date,
            rows
        }
      });
    } catch (error) {
      logger.error(error)
      return sendError(res, response.server_error, '伺服器錯誤，請稍後再試', 500);
    }
})
// 取消訂單
router.post('/cancel', verifyToken, async (req, res) => {
  /* 	
  #swagger.tags = ['reserve']
  #swagger.summary = '會員取消訂單' 
  #swagger.security = [{
    "BearerAuth": []
  }]
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["ord_number"],
                properties: {
                    ord_number: {
                        type: "string",
                        example: "ORD20250903-26CB0"
                    }
                }
            }
        }
    }
  }
  #swagger.responses[200] = {
    description: "成功",
    content: {
        "application/json": {
            example: {
                code: "000",
                msg: "成功",
                data: ""
            }
        }
    }
  } 
*/
  logger.info('/api/reserve/cancel',req.body)
  const { ord_number } = req.body;
  const { userId } = req.user;

  if (!ord_number) {
    logger.warn("缺少訂單編號")
    return sendError(res, response.missing_info, '缺少訂單編號');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 查詢訂單
    const result = await client.query(
      'SELECT * FROM reserves WHERE ord_number = $1 FOR UPDATE',
      [ord_number]
    );

    const rows = result.rows;
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      logger.warn("找不到該筆訂單")
      return sendError(res, response.unfound_ord, '找不到該筆訂單');
    }

    const order = rows[0];
    const orderStatus = order.status;
    if(orderStatus==='cancelled'){
      await client.query('ROLLBACK');
      logger.warn("無法重複取消訂單")
      return sendError(res, response.cancel_error, '無法重複取消訂單');
    }
  
    // 確認是否是自己的訂單
    if (order.user_id !== userId) {
      await client.query('ROLLBACK');
      logger.warn("無權限取消此訂單")
      return sendError(res, response.unauthorized_activity, '無權限取消此訂單');
    }

    // 刪除訂單
    const status = 'cancelled';
    const cancelTime = dayjs().toISOString();
    await client.query(
      'UPDATE reserves SET status = $1, cancel_time = $2 WHERE ord_number = $3',
      [status, cancelTime, ord_number]
    );
    await client.query('COMMIT');

    res.status(200).json({
      code: response.success,
      msg: '取消成功',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(error)
    return sendError(res, response.server_error, '伺服器錯誤，請稍後再試', 500);
  } finally {
    client.release();
  }
});
// email取消訂單
router.post('/cancel-email', async (req, res) => {
  /* 	
  #swagger.tags = ['reserve']
  #swagger.summary = 'email取消訂單' 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["cancel_token"],
                properties: {
                    cancel_token: {
                        type: "string",
                        example: "5741cff6c5ab4353da2c9bc45f64f7b8187e1ab52de80e426cfb5e09205876f6"
                    }
                }
            }
        }
    }
  }
  #swagger.responses[200] = {
    description: "成功",
    content: {
        "application/json": {
            example: {
                code: "000",
                msg: "成功",
                data: {
                    ord_number: "ORD20250903-26CB0"
                }
            }
        }
    }
  } 
*/
  logger.info('/api/reserve/cancel-email',req.body)
  const { cancel_token } = req.body;

  if (!cancel_token) {
    logger.warn("缺少訂單token")
    return sendError(res, response.missing_info, '缺少訂單token');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 查詢訂單
    const result = await client.query(
      'SELECT * FROM reserves WHERE cancel_token = $1 FOR UPDATE',
      [cancel_token]
    );

    const rows = result.rows;
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      logger.warn("找不到該筆訂單")
      return sendError(res, response.unfound_ord, '找不到該筆訂單');
    }
    const order = rows[0];
    const orderStatus = order.status;
    if(orderStatus==='cancelled'){
      await client.query('ROLLBACK');
      logger.warn("無法重複取消訂單")
      return sendError(res, response.cancel_error, '無法重複取消訂單');
    }
    const ord_number = order.ord_number
    const cancel_expired = order.cancel_expired

    // 驗證是否過期
    const now = dayjs();
    if (now.isAfter(cancel_expired)) {
      await client.query('ROLLBACK');
      logger.warn("已超過可取消時間")
      return sendError(res, response.expired_cancel, '已超過可取消時間');
    }

    // 刪除訂單
    const status = 'cancelled';
    const cancelTime = dayjs().toISOString();
    await client.query(
      'UPDATE reserves SET status = $1, cancel_time = $2 WHERE ord_number = $3',
      [status, cancelTime, ord_number]
    );
    await client.query('COMMIT');

    res.status(200).json({
      code: response.success,
      msg: '訂單取消成功',
      data: {ord_number}
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(error)
    return sendError(res, response.server_error, '伺服器錯誤，請稍後再試', 500);
  } finally {
    client.release();
  }
});
module.exports = router;