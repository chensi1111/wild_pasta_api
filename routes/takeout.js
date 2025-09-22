const express = require('express');
const logger=require('../logger');
const db =require('../db')
const { randomUUID } = require('crypto');
const response=require('../utils/response_codes')
const router = express.Router(); 
const {verifyToken} = require("../middleware/auth");
const sendEmail = require("../utils/sendEmail");
const {getProductList,getProductListForPay} = require('../utils/translateMap')
const dayjs = require("dayjs")
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const {generateCancelToken} = require('../utils/token')
const ecpay_payment = require('ecpay_aio_nodejs/lib/ecpay_payment.js');
const options = require('ecpay_aio_nodejs/conf/config-example');
const { genCheckMacValue } = require('../utils/ecpay');
dayjs.extend(utc);
dayjs.extend(timezone);

function sendError(res, code, msg, data, status = 400) {
  return res.status(status).json({ code, msg, data });
}
// 查詢可用時間
router.post("/time", async (req, res) => {
  /* 	
  #swagger.tags = ['takeout']
  #swagger.summary = '查詢可用時間' 

  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["count"],
                properties: {
                    count: {
                        type: "number",
                        example: "2"
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
                    availableTimes:[{end:"18:30:00",start:"18:00:00"},{end:"19:00:00",start:"18:30:00"}]
                }
            }
        }
    }
  } 
*/
  logger.info("/api/takeout/time", req.body);
  let { count } = req.body;
  try {
    // 查詢當前時間+105分鐘以後的時段
    const result = await db.query(
      `
      SELECT time_slot, max_capacity
      FROM takeout_capacity
      WHERE date = CURRENT_DATE
      AND (date + time_slot) >= ((NOW() AT TIME ZONE 'Asia/Taipei') + INTERVAL '105 minutes')
      ORDER BY time_slot ASC
      `,
      []
    );

    const rows = result.rows;
    const availableTimes = [];
    const todayTaipei = dayjs().tz("Asia/Taipei").format("YYYY-MM-DD");
    for (let i = 0; i < rows.length; i++) {
      let current = rows[i];
      const startTime = dayjs.tz(`${todayTaipei}T${current.time_slot}`, "Asia/Taipei");

      if (count <= current.max_capacity) {
        availableTimes.push({
          start: current.time_slot,
          end: startTime.add(30, 'minute').format('HH:mm:ss')
        });
      }
    }

    if (availableTimes.length === 0) {
      logger.warn("沒有可用的時段")
      return sendError(res, response.empty_capacity, '沒有可用的時段');
    }

    res.status(200).json({
      code: response.success,
      msg: '查詢成功',
      data: {
        today:todayTaipei,
        availableTimes
    }
    });

  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, '伺服器錯誤，請稍後再試', 500);
  }
});
// 付款
router.post("/pay",async (req,res) => {
  logger.info('/api/takeout/pay',req.body)
  let { userId,name,date,start_time,end_time,list,count,price,discount,point,remark,phone_number,email } = req.body;
  if(!name|| !date || !start_time|| !end_time|| !list|| !count|| !price|| !phone_number|| !email){
    logger.warn("缺乏必要資料")
    return sendError(res, response.missing_info, '缺乏必要資料');
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
  const allowedTimes = ['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'];
  if (!allowedTimes.includes(start_time)) {
    logger.warn("不符合規範的時間")
    return sendError(res, response.invalid_time, '不符合規範的時間');
  }
  const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!dateRegex.test(date)) {
    logger.warn("日期格式錯誤")
    return sendError(res, response.invalid_date, '日期格式錯誤');
  }
  if(remark && remark.length > 100) {
    logger.warn("備註過長")
    return sendError(res, response.invalid_remark, '備註過長');
  }
  if(price<=0){
    logger.warn("金額錯誤")
    return sendError(res, response.invalid_price, '金額錯誤');
  }
  // 產生訂單號碼
  const datePart = dayjs().format('YYYYMMDD');
  const randomPart = randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase();
  const ord_number = `TKO${datePart}${randomPart}`;
  const ord_time = dayjs().toISOString();
  const taipeiOrd_time = dayjs().tz("Asia/Taipei").format("YYYY/MM/DD HH:mm:ss");
  const total =String(price - discount)
  const status = 'pending'
  try {
    await db.query(
      'INSERT INTO payment_request (ord_number,ord_time,user_id,name,date,start_time,end_time,list,count,price,discount,point,remark,phone_number,email,status) VALUES ( $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)',
      [ord_number,ord_time,userId,name,date,start_time,end_time,list,count,price,discount,point,remark,phone_number,email,status]
    );
    const base_param = {
    MerchantTradeNo: ord_number,
    MerchantTradeDate: taipeiOrd_time,
    TotalAmount: total,
    TradeDesc: 'Wild Pasta 外帶訂單',
    ItemName: getProductListForPay(list),
    ReturnURL: 'https://wild-pasta-api.onrender.com/api/takeout/pay-return',
    ClientBackURL: 'https://wild-pasta.vercel.app/user/shopping-cart/complete',
    ChoosePayment: 'ALL'
    };
    const create = new ecpay_payment(options);
    const html = create.payment_client.aio_check_out_all(base_param);
    const cleanHtml = html.replace(/<script[\s\S]*<\/script>/gi, '');
    res.status(200).json({
      code: response.success,
      msg: '成功',
      data: cleanHtml,
    });
  } catch (error) {
    logger.error(error)
    sendError(res, response.server_error, '伺服器錯誤',500);
  }
})
// 綠界回傳
router.post("/pay-return",async (req, res) => {
  logger.info('/api/takeout/pay-return',req.body)
  const params = req.body;
  const client = await db.connect();
  let userId
  
  try {
    const checkValue = genCheckMacValue(
      params,
      process.env.ECPAY_HASH_KEY,
      process.env.ECPAY_HASH_IV
    );
    if (params.CheckMacValue !== checkValue) {
      logger.warn('CheckMacValue 驗證失敗');
      return res.send('0|Fail');
    }
    await client.query('BEGIN');
    const paymentResult = await client.query(
    'SELECT * FROM payment_request WHERE ord_number = $1 AND status = pending',
       [params.MerchantTradeNo]
    );
    const paymentData = paymentResult.rows[0]
    if (!paymentData) {
      await client.query('ROLLBACK');
      logger.warn('找不到訂單');
      return res.send('1|OK');
    }
  
    if (params.RtnCode === '1') {
    // 付款成功 
    const capacityResult = await client.query(
       `
       UPDATE takeout_capacity
       SET max_capacity = max_capacity - $2
       WHERE time_slot = $1
       AND max_capacity >= $2
       RETURNING time_slot, max_capacity
       `,
       [paymentData.start_time, paymentData.count]
    );
    if (capacityResult.rows.length === 0) {
      await client.query('ROLLBACK');
      logger.warn("該時段單量已滿")
      return res.send('1|OK');
     }
     // 取消訂單token
     const cancel_token = generateCancelToken()
     const orderTime = dayjs(paymentData.date).hour(Number(paymentData.end_time.slice(0,2))).minute(Number(paymentData.end_time.slice(3,5)));
     const taipei = dayjs.tz(paymentData.ord_time, "Asia/Taipei");
     const utcTime = taipei.utc().format();
     const date = dayjs(paymentData.date).format('YYYY/MM/DD')
     const cancel_expired = orderTime.add(-90, 'minute').toISOString();
     const status = 'active'
    userId = paymentData.user_id || null;
    await client.query(
      'INSERT INTO takeouts (ord_number,ord_time,user_id,name,date,start_time,end_time,list,price,discount,point,remark,phone_number,email,status,cancel_token,cancel_expired) VALUES ( $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)',
      [paymentData.ord_number,utcTime,userId,paymentData.name,paymentData.date,paymentData.start_time,paymentData.end_time,paymentData.list,paymentData.price,paymentData.discount,paymentData.point,paymentData.remark,paymentData.phone_number,paymentData.email,status,cancel_token,cancel_expired]
    );
    // 儲存使用點數
    if(paymentData.discount > 0 && userId){
      await client.query(
        `INSERT INTO points (user_id, ord_number, ord_time, point, action,create_time) VALUES ($1, $2, $3, $4, 'use', $5)`,
        [userId, paymentData.ord_number, utcTime, paymentData.discount, utcTime]
      )
    }
    if(userId){
      // 累積點數
      await client.query(
          `
        UPDATE users
        SET point = point + $1
        WHERE user_id = $2
        `,
      [paymentData.point, userId] 
      );
      // 儲存點數記錄
      await client.query(
        `INSERT INTO points (user_id, ord_number, ord_time, point, action,create_time) VALUES ($1, $2, $3, $4, 'earn', $5)`,
      [userId, paymentData.ord_number, utcTime, paymentData.point, utcTime]
      )
    }
    await sendEmail(
      paymentData.email,
      "Wild Pasta 外帶下單成功",
      `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fafafa; border-radius: 8px; border: 1px solid #eaeaea;">
        <div style="text-align: center; padding-bottom: 10px; border-bottom: 2px solid #333;">
          <h1 style="color: #333; margin: 0; font-size: 28px;">Wild Pasta</h1>
          <p style="color: #666; margin: 4px 0 0;">感謝您的訂單！</p>
        </div>
    
        <div style="padding: 20px 0;">
          <h2 style="color: #333; font-size: 20px;">訂單資訊</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">訂單編號</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold; color: #333;">${paymentData.ord_number}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">下單時間</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #333;">${paymentData.ord_time}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">姓名</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #333;">${paymentData.name}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">取餐日期</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #333;">${date}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">取餐時間</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #333;">${paymentData.end_time}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;white-space: nowrap;">訂單內容</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #333;word-break: break-word;max-width: 400px;">${getProductList(paymentData.list)}</td>
            </tr>
          </table>
        </div>
    
        <div style="margin-top: 15px; padding: 15px; background-color:rgb(255, 255, 255); border-radius: 6px; border: 1px solid rgb(230, 230, 230);">
          <p style="margin: 0; color: #333; font-size: 16px;">
            小計：<b>${paymentData.price}</b> 元<br>
            折扣：<b>${paymentData.discount}</b> 元<br>
            總計：<b style="font-size: 18px; color: #d9534f;">${paymentData.price - paymentData.discount}</b> 元<br>
            ${paymentData.point ? `獲得點數：<b>${paymentData.point}</b>` : ""}
          </p>
        </div>
    
        ${
          paymentData.remark
            ? `
          <div style="margin-top: 15px; padding: 12px; background-color: rgb(255, 255, 255); border-radius: 6px; border: 1px solid rgb(230, 230, 230);">
            <p style="margin: 0; color: #333;">備註：${paymentData.remark}</p>
          </div>
          `
            : ""
        }
        <div style="margin-top: 15px; padding: 12px; background-color: rgb(255, 255, 255); border-radius: 6px; border: 1px solid rgb(230, 230, 230);">
            <a href="${process.env.WEBSITE_URL}/cancel-order?TKOToken=${cancel_token}" style="margin: 0; color: #333">點擊取消訂單</a>
            <p style="margin: 5px 0 0 0; color: #d9534f;font-size:12px">取餐時間前90分鐘不可取消</p>
          </div>
        <div style="margin-top: 25px; text-align: center; padding-top: 10px; border-top: 1px solid #eaeaea;">
          <p style="margin: 0; font-size: 14px; color: #999;">感謝您選擇 Wild Pasta</p>
          <p style="margin: 4px 0 0; font-size: 14px; color: #999;">如有問題，請聯絡我們：<a href="mailto:chensiProjectTest4832@gmail.com" style="color: #333; text-decoration: none;">chensiProjectTest4832@gmail.com</a></p>
        </div>
      </div>
      `
    );
    await client.query(
      'UPDATE payment_request SET status=$1 WHERE ord_number=$2',
      ['success', params.MerchantTradeNo]
    );
  } else {
    // 付款失敗
    logger.warn('付款失敗');
    await client.query(
      'UPDATE payment_request SET status=$1 WHERE ord_number=$2',
      ['failed', params.MerchantTradeNo]
    );
    return res.send('1|OK');
  }
  await client.query('COMMIT');
  return res.send('1|OK');
} catch (error) {
  await client.query('ROLLBACK');
  logger.error(error)
  return res.send('0|FAIL');
}finally {
  client.release();
}
})
// 下單
router.post("/order",async (req, res) => {
  /* 	
  #swagger.tags = ['takeout']
  #swagger.summary = '外帶下單' 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["name","date","start_time","end_time","list","count","price","phone_number","email"],
                properties: {
                    userId: {
                      type: "string",
                      example: "123f5b04-594c-4bbd-9c2e-46350a8e5701"
                    },
                    name: {
                      type: "string",
                      example: "小明"
                    },
                    date: {
                      type: "string",
                      example: "2025-09-05"
                    },
                    start_time: {
                      type: "string",
                      example: "19:00"
                    },
                    end_time: {
                      type: "string",
                      example: "19:30"
                    },
                    list: {
                      type: "string",
                      example: "pastaB_1,pastaC_1,pastaD_1,pastaE_1"
                    },
                    count: {
                      type: "number",
                      example: 4
                    },
                    price: {
                      type: "number",
                      example: 1350
                    },
                    discount: {
                      type: "number",
                      example: 0
                    },
                    point: {
                      type: "number",
                      example: 40
                    },
                    remark: {
                      type: "string",
                      example: ""
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
                  data: {
                      name:"小明",
                      date:"2025-09-05",
                      start_time:"19:00",
                      end_time:"19:30",
                      list:"pastaB_1,pastaC_1,pastaD_1,pastaE_1",
                      count:4,
                      price:1350,
                      discount:0,
                      point:40,
                      remark:"",
                      phone_number:"0912345678",
                      email:"chensitest4832@gmail.com",
                      ord_number:"TKO20250905-784F5",
                      ord_time:"2025-09-05T09:02:48.289Z"
                  }
              }
          }
      }
  } 
*/
  logger.info('/api/takeout/order',req.body)
  let { userId,name,date,start_time,end_time,list,count,price,discount,point,remark,phone_number,email } = req.body;
  if(!name|| !date || !start_time|| !end_time|| !list|| !count|| !price|| !phone_number|| !email){
    logger.warn("缺乏必要資料")
    return sendError(res, response.missing_info, '缺乏必要資料');
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
  const allowedTimes = ['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'];
  if (!allowedTimes.includes(start_time)) {
    logger.warn("不符合規範的時間")
    return sendError(res, response.invalid_time, '不符合規範的時間');
  }
  const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!dateRegex.test(date)) {
    logger.warn("日期格式錯誤")
    return sendError(res, response.invalid_date, '日期格式錯誤');
  }
  if(remark && remark.length > 100) {
    logger.warn("備註過長")
    return sendError(res, response.invalid_remark, '備註過長');
  }
  if(price<=0){
    logger.warn("金額錯誤")
    return sendError(res, response.invalid_price, '金額錯誤');
  }
  const client = await db.connect();
  try {
  await client.query('BEGIN');
  const result = await client.query(
    `
    UPDATE takeout_capacity
    SET max_capacity = max_capacity - $2
    WHERE time_slot = $1
      AND max_capacity >= $2
    RETURNING time_slot, max_capacity
    `,
    [start_time, count]
  );

  if (result.rows.length === 0) {
    await client.query('ROLLBACK');
    logger.warn("該時段單量已滿")
    return sendError(res, response.empty_capacity, '該時段單量已滿');
  }
  // 產生訂單號碼
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const randomPart = randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase(); 
  const ord_number = `TKO${year}${month}${day}-${randomPart}`;

  // 下單時間
  const ord_time = dayjs().toISOString()

  // 取消訂單token
  const cancel_token = generateCancelToken()
  const orderTime = dayjs(`${date} ${end_time}`, 'YYYY-MM-DD HH:mm');
  const cancel_expired = orderTime.add(-90, 'minute').toISOString();

  const status = 'active'
  if(userId==''){
    userId=null
  }
  await client.query(
      'INSERT INTO takeouts (ord_number,ord_time,user_id,name,date,start_time,end_time,list,price,discount,point,remark,phone_number,email,status,cancel_token,cancel_expired) VALUES ( $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)',
      [ord_number,ord_time,userId,name,date,start_time,end_time,list,price,discount,point,remark,phone_number,email,status,cancel_token,cancel_expired]
  );
  // 儲存使用點數
  if(discount > 0 && userId){
    await client.query(
      `INSERT INTO points (user_id, ord_number, ord_time, point, action,create_time) VALUES ($1, $2, $3, $4, 'use', $5)`,
      [userId, ord_number, ord_time, discount, ord_time]
    )
  }
  
  if(userId){
    // 累積點數
    await client.query(
      `
      UPDATE users
      SET point = point + $1
      WHERE user_id = $2
      `,
    [point, userId] 
    );
    // 儲存點數記錄
    await client.query(
      `INSERT INTO points (user_id, ord_number, ord_time, point, action,create_time) VALUES ($1, $2, $3, $4, 'earn', $5)`,
    [userId, ord_number, ord_time, point, ord_time]
    )
  }
  await sendEmail(
      email,
      "Wild Pasta 外帶下單成功",
      `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fafafa; border-radius: 8px; border: 1px solid #eaeaea;">
        <div style="text-align: center; padding-bottom: 10px; border-bottom: 2px solid #333;">
          <h1 style="color: #333; margin: 0; font-size: 28px;">Wild Pasta</h1>
          <p style="color: #666; margin: 4px 0 0;">感謝您的訂單！</p>
        </div>
    
        <div style="padding: 20px 0;">
          <h2 style="color: #333; font-size: 20px;">訂單資訊</h2>
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
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">取餐日期</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #333;">${date}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">取餐時間</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #333;">${end_time}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;white-space: nowrap;">訂單內容</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #333;word-break: break-word;max-width: 400px;">${getProductList(list)}</td>
            </tr>
          </table>
        </div>
    
        <div style="margin-top: 15px; padding: 15px; background-color:rgb(255, 255, 255); border-radius: 6px; border: 1px solid rgb(230, 230, 230);">
          <p style="margin: 0; color: #333; font-size: 16px;">
            小計：<b>${price}</b> 元<br>
            折扣：<b>${discount}</b> 元<br>
            總計：<b style="font-size: 18px; color: #d9534f;">${price - discount}</b> 元<br>
            ${point ? `獲得點數：<b>${point}</b>` : ""}
          </p>
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
        <div style="margin-top: 15px; padding: 12px; background-color: rgb(255, 255, 255); border-radius: 6px; border: 1px solid rgb(230, 230, 230);">
            <a href="http://localhost:5184/cancel-order?TKOToken=${cancel_token}" style="margin: 0; color: #333">點擊取消訂單</a>
            <p style="margin: 5px 0 0 0; color: #d9534f;font-size:12px">取餐時間前90分鐘不可取消</p>
          </div>
        <div style="margin-top: 25px; text-align: center; padding-top: 10px; border-top: 1px solid #eaeaea;">
          <p style="margin: 0; font-size: 14px; color: #999;">感謝您選擇 Wild Pasta</p>
          <p style="margin: 4px 0 0; font-size: 14px; color: #999;">如有問題，請聯絡我們：<a href="mailto:chensiProjectTest4832@gmail.com" style="color: #333; text-decoration: none;">chensiProjectTest4832@gmail.com</a></p>
        </div>
      </div>
      `
    );
  await client.query('COMMIT');

  const ordData={
    ord_number,ord_time,name,date,end_time,list,price,discount,point,remark,phone_number,email
  }
  res.status(200).json({
    code: response.success,
    msg: '下單成功',
    data: ordData,
  });
} catch (error) {
  await client.query('ROLLBACK');
  logger.error(error)
  sendError(res, response.server_error, '伺服器錯誤',500);
}finally {
  // 釋放連線
  client.release();
}
})
// 取消訂單
router.post('/cancel', verifyToken, async (req, res) => {
/* 	
  #swagger.tags = ['takeout']
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
                        example: "TKO20250902-0CA70"
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
  logger.info('/api/takeout/cancel',req.body)
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
      'SELECT * FROM takeouts WHERE ord_number = $1 FOR UPDATE',
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
    const point = order.point;
    const ord_time = order.ord_time

    // 確認是否是自己的訂單
    if (order.user_id !== userId) {
      await client.query('ROLLBACK');
      logger.warn("無權限取消此訂單")
      return sendError(res, response.unauthorized_activity, '無權限取消此訂單');
    }

    // 扣掉該筆訂單獲得的點數
    await client.query(
      `UPDATE users 
       SET point = GREATEST(point - $1, 0) 
       WHERE user_id = $2`,
      [point, userId]
    );

    // 刪除訂單
    const status = 'cancelled';
    const currentTime = dayjs().toISOString();
    await client.query(
      'UPDATE takeouts SET status = $1, cancel_time = $2 WHERE ord_number = $3',
      [status, currentTime, ord_number]
    );
    // 儲存點數記錄
    await client.query(
      `INSERT INTO points (user_id, ord_number, ord_time, point, action,create_time) VALUES ($1, $2, $3, $4, 'cancel', $5)`,
      [userId, ord_number, ord_time, point, currentTime]
    )
    await client.query('COMMIT');

    res.status(200).json({
      code: response.success,
      msg: '取消成功，點數已扣除',
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
  #swagger.tags = ['takeout']
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
                        example: "3277d494032f07dbce1c5072a328f2a19e831d3f239a513fb9089ea24ab9ac28"
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
                    ord_number: "TKO20250902-B9F76"
                }
            }
        }
    }
  } 
*/

  logger.info('/api/takeout/cancel-email',req.body)
  const { cancel_token } = req.body;

  if (!cancel_token) {
    logger.warn("缺少訂單資訊")
    return sendError(res, response.missing_info, '缺少訂單資訊');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 查詢訂單
    const result = await client.query(
      'SELECT * FROM takeouts WHERE cancel_token = $1 FOR UPDATE',
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
    const point = order.point;
    const ord_time = order.ord_time
    const user_id = order.user_id
    const ord_number = order.ord_number
    const cancel_expired = order.cancel_expired
    if(orderStatus==='cancelled'){
      await client.query('ROLLBACK');
      logger.warn("無法重複取消訂單")
      return sendError(res, response.cancel_error, '無法重複取消訂單',{ord_number});
    }
  
    // 驗證是否過期
    const now = dayjs();
    if (now.isAfter(cancel_expired)) {
      await client.query('ROLLBACK');
      logger.warn("已超過可取消時間")
      return sendError(res, response.expired_cancel, '已超過可取消時間',{ord_number});
    }

    // 扣掉該筆訂單獲得的點數
    if(user_id){
      await client.query(
        `UPDATE users 
         SET point = GREATEST(point - $1, 0) 
         WHERE user_id = $2`,
        [point, user_id]
      );

    }
    // 刪除訂單
    const status = 'cancelled';
    const currentTime = dayjs().toISOString();
    await client.query(
      'UPDATE takeouts SET status = $1, cancel_time = $2 WHERE ord_number = $3',
      [status, currentTime, ord_number]
    );
    // 儲存點數記錄
    if(user_id){
      await client.query(
        `INSERT INTO points (user_id, ord_number, ord_time, point, action,create_time) VALUES ($1, $2, $3, $4, 'cancel', $5)`,
        [user_id, ord_number, ord_time, point, currentTime]
      )
    }
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