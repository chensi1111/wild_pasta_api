const express = require("express");
const logger = require("../logger")
const response = require("../utils/response_codes");
const router = express.Router();
const db = require("../db");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { generateTokens, getTokens,generateResetToken } = require("../utils/token");
const verifyToken = require("../middleware/auth");
const sendEmail = require("../utils/sendEmail");
const dayjs = require("dayjs");
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);

function sendError(res, code, msg, status = 400) {
  return res.status(status).json({ code, msg });
}
const SENSITIVE_FIELDS = ['password', 'oldPassword', 'newPassword', 'refreshToken'];
function sanitizeBody(body) {
  const sanitized = { ...body };
  for (const field of SENSITIVE_FIELDS) {
    if (sanitized[field]) {
      sanitized[field] = '***'; // 遮蔽
    }
  }
  return sanitized;
}

// 註冊
router.post("/register", async (req, res) => {
  /* 	
  #swagger.tags = ['user']
  #swagger.summary = '註冊帳號' 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["account","password","email","name"],
                properties: {
                    account: {
                        type: "string",
                        example: "test12345"
                    },
                    password: {
                        type: "string",
                        example: "aa12345678"
                    },
                    email: {
                        type: "string",
                        example: "test123@gmail.com"
                    },
                    name: {
                        type: "string",
                        example: "test12345"
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
  const sanitizedBody = sanitizeBody(req.body);
  logger.info('/api/user/register',sanitizedBody)
  let { account, password, email, name } = req.body;
  account = account?.trim();
  email = email?.trim();
  name = name?.trim();

  if (!account || !password || !email || !name) {
    logger.warn("缺少必要的資料")
    return sendError(res, response.missing_info, "缺少必要的資料");
  }
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
    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      "INSERT INTO users (user_id, account, password, email, name) VALUES ($1, $2, $3, $4, $5)",
      [userId, account, hashedPassword, email, name]
    );
    res.status(201).json({
      code: response.success,
      msg: "註冊成功",
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 登入
router.post("/login", async (req, res) => {
    /* 	
  #swagger.tags = ['user']
  #swagger.summary = '登入帳號' 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["account","password"],
                properties: {
                    account: {
                        type: "string",
                        example: "test12345"
                    },
                    password: {
                        type: "string",
                        example: "aa12345678"
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
                  refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjNmNWIwNC01OTRjLTRiYmQtOWMyZS00NjM1MGE4ZTU3MDEiLCJpYXQiOjE3NTczMjMwOTQsImV4cCI6MTc1NzkyNzg5NH0.BX2QHVXnKKxXlFsi3UtTHUh4EiX5tuHXVjQcnboiu5A",
                  accessToken : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjNmNWIwNC01OTRjLTRiYmQtOWMyZS00NjM1MGE4ZTU3MDEiLCJpYXQiOjE3NTczMjMwOTQsImV4cCI6MTc1NzMyNjY5NH0.W9JKeMkZGFMtfydNFwkNylJLErq3v0U8RIxY__amguE",
                  account: "test12345",
                  email: "test12345@gmail.com",
                  userId: "123f5b04-594c-4bbd-9c2e-46350a8e5701",
                  name: "test12345",
                  phone: "0912345678",
                  point: "30"
                }
            }
        }
    }
  } 
*/
  const sanitizedBody = sanitizeBody(req.body);
  logger.info('/api/user/login',sanitizedBody)
  let { account, password } = req.body;
  account = account?.trim();

  if (!account || !password) {
    logger.warn("缺少必要的資料")
    return sendError(res, response.missing_info, "缺少必要的資料");
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

  try {
    const result = await db.query("SELECT * FROM users WHERE account = $1", [
      account,
    ]);
    const rows = result.rows;
    if (rows.length === 0) {
      logger.warn("帳號不存在")
      return sendError(res, response.unfound_account, "帳號不存在");
    }
    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn("密碼錯誤")
      return sendError(res, response.wrong_password, "密碼錯誤");
    }

    const payload = {
      userId: user.user_id,
    };
    // 刪除舊的refreshToken
    await db.query("DELETE FROM refresh_tokens WHERE user_id = $1", [
      user.user_id,
    ]);
    const tokens = generateTokens(payload);
    // 從token中獲取過期時間
    const decoded = jwt.decode(tokens.refreshToken);
    const expiresAt = new Date(decoded.exp * 1000);
    // 將refreshToken存進資料庫
    await db.query(
      "INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)",
      [tokens.refreshToken, user.user_id, expiresAt]
    );
    res.status(200).json({
      code: response.success,
      msg: "登入成功",
      data: {
        ...tokens,
        account: user.account,
        email: user.email,
        userId: user.user_id,
        name: user.name,
        picture: user.picture,
        phone:user.phone,
        point:user.point
      },
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 刷新Token
router.post("/refresh", async (req, res) => {
  /* 	
  #swagger.tags = ['user']
  #swagger.summary = '刷新token' 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["refreshToken","userId"],
                properties: {
                    refreshToken: {
                        type: "string",
                        example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjNmNWIwNC01OTRjLTRiYmQtOWMyZS00NjM1MGE4ZTU3MDEiLCJpYXQiOjE3NTczMjMwOTQsImV4cCI6MTc1NzkyNzg5NH0.BX2QHVXnKKxXlFsi3UtTHUh4EiX5tuHXVjQcnboiu5A"
                    },
                    userId: {
                        type: "string",
                        example: "123f5b04-594c-4bbd-9c2e-46350a8e5701"
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
                  refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjNmNWIwNC01OTRjLTRiYmQtOWMyZS00NjM1MGE4ZTU3MDEiLCJpYXQiOjE3NTczMjMwOTQsImV4cCI6MTc1NzkyNzg5NH0.BX2QHVXnKKxXlFsi3UtTHUh4EiX5tuHXVjQcnboiu5A",
                  accessToken : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjNmNWIwNC01OTRjLTRiYmQtOWMyZS00NjM1MGE4ZTU3MDEiLCJpYXQiOjE3NTczMjMwOTQsImV4cCI6MTc1NzMyNjY5NH0.W9JKeMkZGFMtfydNFwkNylJLErq3v0U8RIxY__amguE",
                }
            }
        }
    }
  } 
*/
  const sanitizedBody = sanitizeBody(req.body);
  logger.info('/api/user/refresh',sanitizedBody)
  const { refreshToken, userId } = req.body;
  if (!refreshToken) {
    logger.warn("缺少RefreshToken")
    return sendError(res,response.missing_info,"缺少RefreshToken");
  }

  try {
    // 先驗證refreshToken是否存在
    const result = await db.query(
      "SELECT * FROM refresh_tokens WHERE token = $1",
      [refreshToken]
    );
    const rows = result.rows
    if (rows.length === 0) {
      logger.warn("Refresh Token 無效")
      return sendError(res,response.invalid_refreshToken,"Refresh Token 無效");
    }
    const tokens = getTokens(refreshToken);
    // 從資料庫中移除 refreshToken
    await db.query("DELETE FROM refresh_tokens WHERE token = $1", [
      refreshToken,
    ]);
    // 從新的token中獲取過期時間
    const decoded = jwt.decode(tokens.refreshToken);
    const expiresAt = new Date(decoded.exp * 1000);
    // 將refreshToken存進資料庫
    await db.query(
      "INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)",
      [tokens.refreshToken, userId, expiresAt]
    );
    res.status(200).json({
      code: response.success,
      msg: "成功刷新 Token",
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 登出
router.post("/logout", async (req, res) => {
  /* 	
  #swagger.tags = ['user']
  #swagger.summary = '登出' 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["refreshToken"],
                properties: {
                    refreshToken: {
                        type: "string",
                        example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjNmNWIwNC01OTRjLTRiYmQtOWMyZS00NjM1MGE4ZTU3MDEiLCJpYXQiOjE3NTczMjMwOTQsImV4cCI6MTc1NzkyNzg5NH0.BX2QHVXnKKxXlFsi3UtTHUh4EiX5tuHXVjQcnboiu5A"
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
  const sanitizedBody = sanitizeBody(req.body);
  logger.info('/api/user/logout',sanitizedBody)
  const { refreshToken } = req.body;
  if (!refreshToken) {
    logger.warn("缺少 Refresh Token")
    return sendError(res,response.missing_info,"缺少 Refresh Token");
  }

  try {
    // 從資料庫中移除 refreshToken
    await db.query("DELETE FROM refresh_tokens WHERE token = $1", [
      refreshToken,
    ]);
    return res.status(200).json({
      code: response.success,
      msg: "成功登出",
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 訂單
router.post("/reserve", verifyToken, async (req, res) => {
    /* 	
  #swagger.tags = ['user']
  #swagger.summary = '查詢預約訂單'
    #swagger.security = [{
    "BearerAuth": []
  }] 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["page,pageSize"],
                properties: {
                    page: {
                        type: "number",
                        example: 1
                    },
                    pageSize: {
                        type: "number",
                        example: 10
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
                  rows: [{
                    name:"test12345",
                    ord_number:"ORD20250908-83052",
                    ord_time:"2025-09-08T08:49:55.736Z",
                    date:"2025-09-07T16:00:00.000Z",
                    time:"19:00:00",
                    theme:"family",
                    email:"test12345@gmail.com",
                    phone_number:"",
                    people:2,
                    remark:"456",
                    food_allergy:"789",
                    }],
                  total:"3",
                  page:1,
                  pageSize:3,
                  totalPages:1
                }
            }
        }
    }
  } 
*/
  logger.info('/api/user/reserve',req.body)
  const { userId } = req.user;
  const { page, pageSize } = req.body;
  const offset = (page - 1) * pageSize;
  if (page < 1 || pageSize < 1) {
    logger.warn("錯誤的分頁資訊")
    return sendError(res, response.invalid_pageInfo, "錯誤的分頁資訊");
  }
  try {
    // 查詢分頁資料
    const result = await db.query(
      "SELECT ord_number,ord_time,name,date,time,people,remark,theme,phone_number,email,food_allergy FROM reserves WHERE user_id = $1 AND status = 'active' ORDER BY ord_time DESC LIMIT $2 OFFSET $3",
      [userId, pageSize, offset]
    );
    const rows = result.rows

    // 查詢總筆數
    const totalResult = await db.query(
      "SELECT COUNT(*) as total FROM reserves WHERE user_id = $1 status = 'active'",
      [userId]
    );
    const total = totalResult.rows[0].total;
    return res.status(200).json({
      code: response.success,
      msg: "查詢成功",
      data: {
        rows,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 外帶訂單
router.post("/takeout", verifyToken, async (req, res) => {
  /* 	
  #swagger.tags = ['user']
  #swagger.summary = '查詢外帶訂單'
    #swagger.security = [{
    "BearerAuth": []
  }] 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["page,pageSize"],
                properties: {
                    page: {
                        type: "number",
                        example: 1
                    },
                    pageSize: {
                        type: "number",
                        example: 10
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
                  rows: [{
                    name:"test12345",
                    ord_number:"TKO20250908-5E6A0",
                    ord_time:"2025-09-08T08:49:55.736Z",
                    date:"2025-09-07T16:00:00.000Z",
                    end_time:"21:30:00",
                    email:"test12345@gmail.com",
                    phone_number:"0912345678",
                    price: 350,
                    point: 10,
                    discount: 0,
                    list: "pastaD_1,pastaB_3",
                    remark:"456",
                    }],
                  total:"3",
                  page:1,
                  pageSize:3,
                  totalPages:1
                }
            }
        }
    }
  } 
*/
  logger.info('/api/user/takeout',req.body)
  const { userId } = req.user;
  const { page, pageSize } = req.body;
  const offset = (page - 1) * pageSize;
  if (page < 1 || pageSize < 1) {
    logger.warn("錯誤的分頁資訊")
    return sendError(res, response.invalid_pageInfo, "錯誤的分頁資訊");
  }
  try {
    // 查詢分頁資料
    const result = await db.query(
      "SELECT ord_number,ord_time,name,date,end_time,price,point,discount,list,remark,phone_number,email FROM takeouts WHERE user_id = $1 AND status = 'active' ORDER BY ord_time DESC LIMIT $2 OFFSET $3",
      [userId, pageSize, offset]
    );
    const rows = result.rows

    // 查詢總筆數
    const totalResult = await db.query(
      "SELECT COUNT(*) as total FROM takeouts WHERE user_id = $1 AND status = 'active'",
      [userId]
    );
    const total = totalResult.rows[0].total;
    return res.status(200).json({
      code: response.success,
      msg: "查詢成功",
      data: {
        rows,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 更新email請求
router.post("/change-email-request", verifyToken, async (req, res) => {
   /* 	
  #swagger.tags = ['user']
  #swagger.summary = '更改email請求'
    #swagger.security = [{
    "BearerAuth": []
  }] 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["email"],
                properties: {
                    email: {
                        type: "string",
                        example: "test12345@gmail.com"
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
  logger.info('/api/user/change-email-request',req.body)
  const { userId } = req.user;
  const { email } = req.body;

  if (!email) {
    logger.warn("缺少必要的資料")
    return sendError(res, response.missing_info, "缺少必要的資料");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    logger.warn("Email格式錯誤")
    return sendError(res, response.invalid_email, "Email格式錯誤");
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const rows =result.rows
    if (rows.length > 0) {
      client.query('ROLLBACK');
      logger.warn("信箱已被使用")
      return sendError(res, response.email_conflict, "信箱已被使用");
    }
    // 查詢同一 email 是否存在未過期的驗證碼
    const checkVerifyCode = await client.query(`
     SELECT * FROM email_verifications
     WHERE email = $1
     AND used = false
     AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1
    `, [email]);
    if( checkVerifyCode.rows.length > 0) {
      console.log(checkVerifyCode.rows[0],new Date(Date.now()));
      client.query('ROLLBACK');
      logger.warn("已發送驗證碼，請5分鐘後再試")
      return sendError(res, response.verify_conflict, "已發送驗證碼，請5分鐘後再試");
    }
    const expiresAt = dayjs.utc().add(5, 'minute').toDate();
    const verificationCode = Math.floor(100000 + Math.random() * 900000); // 6位數驗證碼
    await sendEmail(
      email,
      "Wild Pasta 變更Email驗證",
      `
       <div style="font-family: Arial, Helvetica, sans-serif; padding: 20px; background-color: #f9f9f9; color: #333; line-height: 1.6; font-size: 16px;">
         <h2 style="color: #222; margin-bottom: 16px;">Wild Pasta 變更 Email 驗證</h2>
         <p style="margin-bottom: 12px;">您好，</p>
         <p style="margin-bottom: 12px;">
           您的驗證碼是： 
           <b style="font-size: 20px; color: #d9534f;">${verificationCode}</b>
          </p>
         <p style="margin-bottom: 12px;">請在 <b>5 分鐘</b> 內使用驗證碼完成驗證。</p>
         <p style="color: #777; font-size: 14px; margin-top: 20px;">
           若您未發起此操作，請忽略此信件。
         </p>
         <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;" />
         <p style="font-size: 14px; color: #999;">
           Wild Pasta 團隊 敬上
         </p>
       </div>
      `
    );
    await client.query(`
      INSERT INTO email_verifications (user_id, email, code, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [userId,email, verificationCode, expiresAt]);

    client.query('COMMIT');
    return res.status(200).json({
      code: response.success,
      msg: "發送成功",
      data: {},
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(error)
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  } finally{
    client.release();
  }
});
// 驗證email
router.post("/verify-email", verifyToken, async (req, res) => {
   /* 	
  #swagger.tags = ['user']
  #swagger.summary = '驗證email'
    #swagger.security = [{
    "BearerAuth": []
  }] 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["email","code"],
                properties: {
                    email: {
                        type: "string",
                        example: "test12345@gmail.com"
                    },
                    code: {
                        type: "string",
                        example: "123456"
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
                    email:"test12345@gmail.com"
                }
            }
        }
    }
  } 
*/
  logger.info('/api/user/verify-email',req.body)
  const { userId } = req.user;
  const { code,email } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // 查詢驗證碼
    const result = await client.query(
      `SELECT * FROM email_verifications 
       WHERE user_id = $1 AND email = $2 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId, email]
    );
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      logger.warn("驗證碼錯誤")
      return sendError(res, response.unfound_verify, "驗證碼錯誤");
    }

    const verification = result.rows[0];
    // 驗證碼是否正確
    if (verification.code !== code) {
      await client.query("ROLLBACK");
      logger.warn("驗證碼錯誤")
      return sendError(res, response.wrong_verify, "驗證碼錯誤");
    }
    // 驗證是否過期
    if (new Date() > verification.expires_at) {
      await client.query("ROLLBACK");
      logger.warn("驗證碼已過期")
      return sendError(res, response.expired_verify, "驗證碼已過期");
    }
    // 更新email
    await client.query("UPDATE users SET email = $1 WHERE user_id = $2", [
      email,
      userId,
    ]);
    // 驗證成功後刪掉這筆驗證碼
    await client.query(
      "DELETE FROM email_verifications WHERE id = $1",
      [verification.id]
    );
    await client.query('COMMIT');
    return res.status(200).json({
      code: response.success,
      msg: "驗證成功",
      data: { email },
    });
  } catch (error) {
    logger.error(error)
    await client.query("ROLLBACK");
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  } finally{
    client.release();
  }
});
// 更新電話號碼
router.post("/change-phone", verifyToken, async (req, res) => {
  /* 	
  #swagger.tags = ['user']
  #swagger.summary = '更改電話號碼'
    #swagger.security = [{
    "BearerAuth": []
  }] 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["phone"],
                properties: {
                    phone: {
                        type: "string",
                        example: "0912345678"
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
  logger.info('/api/user/change-phone',req.body)
  const { userId } = req.user;
  const { phone } = req.body;
  const phoneRegex = /^(09\d{8}|0\d{1,3}-?\d{6,8})$/;
  if (phone !== "" && !phoneRegex.test(phone)) {
    logger.warn("電話號碼格式錯誤")
    return sendError(res, response.invalid_phone, "電話號碼格式錯誤");
  }
  try {
    await db.query("UPDATE users SET phone = $1 WHERE user_id = $2", [
      phone,
      userId,
    ]);

    return res.status(200).json({
      code: response.success,
      msg: "更新成功",
      data: {},
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 更新姓名
router.post("/change-name", verifyToken, async (req, res) => {
  /* 	
  #swagger.tags = ['user']
  #swagger.summary = '更改姓名'
    #swagger.security = [{
    "BearerAuth": []
  }] 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["name"],
                properties: {
                    name: {
                        type: "string",
                        example: "阿明"
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
  logger.info('/api/user/change-name',req.body)
  const { userId } = req.user;
  const { name } = req.body;
  if(!name){
    logger.warn("缺少必要的資料")
    return sendError(res, response.missing_info, "缺少必要的資料");
  }
  if (name.length > 20) {
    logger.warn("姓名過長")
    return sendError(res, response.invalid_name, "姓名過長");
  }
  try {
    await db.query("UPDATE users SET name = $1 WHERE user_id = $2", [
      name,
      userId,
    ]);

    return res.status(200).json({
      code: response.success,
      msg: "更新成功",
      data: {},
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 會員資訊
router.post("/info", verifyToken, async (req, res) => {
  /* 	
  #swagger.tags = ['user']
  #swagger.summary = '會員資訊'
    #swagger.security = [{
    "BearerAuth": []
  }] 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: [],
                properties: {
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
                    name:"阿明",
                    account: "test12345",
                    email: "test12345@gmail.com",
                    phone: "0912345678",
                    point: 30
                }
            }
        }
    }
  } 
*/
  logger.info('/api/user/info',req.body)
  const { userId } = req.user;
  try {
    const result = await db.query(
      "SELECT name,account,email,phone,point FROM users WHERE user_id = $1",
      [userId]
    );
    const rows = result.rows
    return res.status(200).json({
      code: response.success,
      msg: "資料獲取成功",
      data: rows[0],
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
});
// 點數記錄
router.post("/points", verifyToken, async (req, res) => {
    /* 	
  #swagger.tags = ['user']
  #swagger.summary = '點數記錄'
    #swagger.security = [{
    "BearerAuth": []
  }] 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["page,pageSize"],
                properties: {
                    page: {
                        type: "number",
                        example: 1
                    },
                    pageSize: {
                        type: "number",
                        example: 10
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
                  rows: [
                  {
                    ord_number: "TKO20250908-5E6A0",
                    action: "earn",
                    point: 15,
                    ord_time : "2025-09-08T07:45:23.094Z",
                    create_time: "2025-09-08T07:45:23.094Z"
                  },
                  {
                    ord_number: "TKO20250903-E58CE",
                    action: "cancel",
                    point: 20,
                    ord_time : "2025-09-08T07:45:23.094Z",
                    create_time: "2025-09-08T07:45:23.094Z"
                  }
                  ],
                  total:"2",
                  page:1,
                  pageSize:5,
                  totalPages:1
                }
            }
        }
    }
  } 
*/
  logger.info('/api/user/points',req.body)
  const { userId } = req.user;
  const { page, pageSize } = req.body;
  const offset = (page - 1) * pageSize;
  if (page < 1 || pageSize < 1) {
    logger.warn("錯誤的分頁資訊")
    return sendError(res, response.invalid_pageInfo, "錯誤的分頁資訊");
  }
  try {
    // 查詢分頁資料
    const result = await db.query(
      "SELECT id,ord_number,ord_time,point,action,create_time FROM points WHERE user_id = $1 ORDER BY create_time DESC LIMIT $2 OFFSET $3",
      [userId, pageSize, offset]
    );
    const rows = result.rows

    // 查詢總筆數
    const totalResult = await db.query(
      "SELECT COUNT(*) as total FROM points WHERE user_id = $1",
      [userId]
    );
    const total = totalResult.rows[0].total;
    return res.status(200).json({
      code: response.success,
      msg: "資料獲取成功",
      data: {
        rows,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
})
// 變更密碼
router.post("/change-password", verifyToken, async (req, res) => {
    /* 	
  #swagger.tags = ['user']
  #swagger.summary = '變更密碼'
    #swagger.security = [{
    "BearerAuth": []
  }] 
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["oldPassword,newPassword"],
                properties: {
                    oldPassword: {
                        type: "string",
                        example: "aa12345678"
                    },
                    newPassword: {
                        type: "string",
                        example: "bb12345678"
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
  const sanitizedBody = sanitizeBody(req.body);
  logger.info('/api/user/change-password',sanitizedBody)
  const { userId } = req.user;
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    logger.warn("缺少必要的資料")
    return sendError(res, response.missing_info, "缺少必要的資料");
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      "SELECT password FROM users WHERE user_id = $1",
      [userId]
    );
    const rows = result.rows
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      logger.warn("使用者不存在")
      return sendError(res, response.unfound_user, "使用者不存在");
    }
    const isMatch = await bcrypt.compare(oldPassword, rows[0].password);
    if (!isMatch) {
      await client.query('ROLLBACK');
      logger.warn("舊密碼錯誤")
      return sendError(res, response.wrong_password, "舊密碼錯誤");
    }
    const passwordRegex = /^(?=.*[A-Za-z]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      await client.query('ROLLBACK');
      logger.warn("新密碼格式錯誤")
      return sendError(res, response.invalid_password, "新密碼格式錯誤");
    }
    const updatePassword = await bcrypt.hash(newPassword, 10);
    await client.query(
      "UPDATE users SET password = $1 WHERE user_id = $2",
      [updatePassword, userId]
    );
    await client.query('COMMIT');
    return res.status(200).json({
      code: response.success,
      msg: "密碼更新成功",
      data: {},
    });

  } catch (error) {
    logger.error(error)
    await client.query('ROLLBACK');
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  } finally {
    client.release();
  }
})
// 忘記密碼
router.post("/forgot-password", async (req, res) => {
   /* 	
  #swagger.tags = ['user']
  #swagger.summary = '忘記密碼驗證信'
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["account"],
                properties: {
                    account: {
                        type: "string",
                        example: "test12345"
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
  logger.info('/api/user/forget-password',req.body)
  const { account } = req.body;
  if (!account) {
    logger.warn("缺少必要的資料")
    return sendError(res, response.missing_info, "缺少必要的資料");
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query("SELECT email,user_id FROM users WHERE account = $1", [account]);
    const rows = result.rows
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      logger.warn("帳號不存在")
      return sendError(res, response.unfound_account, "帳號不存在");
    }
    // 查詢同一 email 是否存在未過期的驗證碼
    const checkVerifyCode = await client.query(`
     SELECT * FROM password_verifications
     WHERE email = $1
     AND used = false
     AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1
    `, [rows[0].email]);
    if( checkVerifyCode.rows.length > 0) {
      console.log(checkVerifyCode.rows[0],new Date(Date.now()));
      client.query('ROLLBACK');
      logger.warn("已發送驗證碼，請5分鐘後再試")
      return sendError(res, response.email_conflict, "已發送驗證碼，請5分鐘後再試");
    }
    const expiresAt = dayjs.utc().add(5, 'minute').toDate();
    const verificationCode = Math.floor(100000 + Math.random() * 900000); // 6位數驗證碼
    await sendEmail(
      rows[0].email,
      "Wild Pasta 忘記密碼驗證",
      `
       <div style="font-family: Arial, Helvetica, sans-serif; padding: 20px; background-color: #f9f9f9; color: #333; line-height: 1.6; font-size: 16px;">
         <h2 style="color: #222; margin-bottom: 16px;">Wild Pasta 忘記密碼驗證</h2>
         <p style="margin-bottom: 12px;">您好，</p>
         <p style="margin-bottom: 12px;">
           您的驗證碼是： 
           <b style="font-size: 20px; color: #d9534f;">${verificationCode}</b>
          </p>
         <p style="margin-bottom: 12px;">請在 <b>5 分鐘</b> 內使用驗證碼完成驗證。</p>
         <p style="color: #777; font-size: 14px; margin-top: 20px;">
           若您未發起此操作，請忽略此信件。
         </p>
         <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;" />
         <p style="font-size: 14px; color: #999;">
           Wild Pasta 團隊 敬上
         </p>
       </div>
      `
    );
    await client.query(`
      INSERT INTO password_verifications (user_id, email, code, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [rows[0].user_id,rows[0].email, verificationCode, expiresAt]);
    client.query('COMMIT');
    return res.status(200).json({
      code: response.success,
      msg: "發送成功",
      data: { },
    });
  } catch (error) {
    logger.error(error)
    await client.query('ROLLBACK');
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  } finally{
    client.release();
  }
})

// 驗證忘記密碼
router.post("/verify-forgot-password", async (req, res) => {
     /* 	
  #swagger.tags = ['user']
  #swagger.summary = '驗證忘記密碼'
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["account","code"],
                properties: {
                    account: {
                        type: "string",
                        example: "test12345"
                    },
                    code: {
                        type: "string",
                        example: "122345"
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
                    resetToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMTIzZjViMDQtNTk0Yy00YmJkLTljMmUtNDYzNTBhOGU1NzAxIiwiaWF0IjoxNzU3Mzg1OTQyLCJleHAiOjE3NTczODY1NDJ9.ppro7Wtu-PwjmFcKtzVTC1KQQ4XH6wGO9pLEStfExj0"
                }
            }
        }
    }
  } 
*/
  logger.info('/api/user/verify-forgot-password',req.body)
  const { account, code } = req.body;
  if (!account || !code) {
    logger.warn("缺少必要的資料")
    return sendError(res, response.missing_info, "缺少必要的資料");
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query("SELECT email,user_id FROM users WHERE account = $1", [account]);
    const rows = result.rows
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      logger.warn("帳號不存在")
      return sendError(res, response.unfound_account, "帳號不存在");
    }
    // 查詢驗證碼
    const codeResult = await client.query(
      `SELECT * FROM password_verifications 
       WHERE user_id = $1 AND email = $2 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [rows[0].user_id, rows[0].email]
    );
    if (codeResult.rowCount === 0) {
      await client.query("ROLLBACK");
      logger.warn("驗證碼錯誤")
      return sendError(res, response.unfound_verify, "驗證碼錯誤");
    }

    const verification = codeResult.rows[0];
    // 驗證碼是否正確
    if (verification.code !== code) {
      await client.query("ROLLBACK");
      logger.warn("驗證碼錯誤")
      return sendError(res, response.invalid_verify, "驗證碼錯誤");
    }
    // 驗證是否過期
    if (new Date() > verification.expires_at) {
      await client.query("ROLLBACK");
      logger.warn("驗證碼已過期")
      return sendError(res, response.wrong_verify, "驗證碼已過期");
    }
    // 產生重設密碼token
    const resetToken = generateResetToken({ user_id: rows[0].user_id });
    // 驗證成功後刪掉這筆驗證碼
    await client.query(
      "DELETE FROM password_verifications WHERE id = $1",
      [verification.id])
    await client.query('COMMIT');
    return res.status(200).json({
      code: response.success,
      msg: "驗證成功",
      data: {resetToken},
    });
  } catch (error) {
    logger.error(error)
    await client.query("ROLLBACK");
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  } finally{
    client.release();
  }
})
// 忘記密碼重設密碼
router.post("/reset-forgot-password", async (req, res) => {
  /* 	
  #swagger.tags = ['user']
  #swagger.summary = '忘記密碼重設密碼'
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["token","password"],
                properties: {
                    token: {
                        type: "string",
                        example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMTIzZjViMDQtNTk0Yy00YmJkLTljMmUtNDYzNTBhOGU1NzAxIiwiaWF0IjoxNzU3Mzg1OTQyLCJleHAiOjE3NTczODY1NDJ9.ppro7Wtu-PwjmFcKtzVTC1KQQ4XH6wGO9pLEStfExj0"
                    },
                    password: {
                        type: "string",
                        example: "abc12345678"
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
  const sanitizedBody = sanitizeBody(req.body);
  logger.info('/api/user/reset-forgot-password',sanitizedBody)
  const { token, password } = req.body;
  if ( !token || !password) {
    logger.warn("缺少必要的資料")
    return sendError(res, response.missing_info, "缺少必要的資料");
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // 驗證 token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_RESET_PASSWORD_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        await client.query("ROLLBACK");
        logger.warn("驗證碼已過期")
        return sendError(res, response.expired_verify, "驗證碼已過期");
      } else if (error.name === "JsonWebTokenError") {
        await client.query("ROLLBACK");
        logger.warn("驗證碼無效")
        return sendError(res, response.invalid_token, "驗證碼無效");
      } else {
        await client.query("ROLLBACK");
        logger.warn("驗證失敗，請稍後再試")
        return sendError(res, response.verify_error, "驗證失敗，請稍後再試");
      }
    }
    const passwordRegex = /^(?=.*[A-Za-z]).{8,}$/;
    if (!passwordRegex.test(password)) {
      await client.query('ROLLBACK');
      logger.warn("新密碼格式錯誤")
      return sendError(res, response.invalid_password, "新密碼格式錯誤");
    }
    const updatePassword = await bcrypt.hash(password, 10);
    const result = await client.query(
      "UPDATE users SET password = $1 WHERE user_id = $2",
      [updatePassword, decoded.user_id]
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      logger.warn("找不到該使用者")
      return sendError(res, response.invalid_account, "找不到該使用者");
    }
    await client.query('COMMIT');
    return res.status(200).json({
      code: response.success,
      msg: "密碼更新成功",
      data: {},
    });
  } catch (error) {
    logger.error(error)
    await client.query("ROLLBACK");
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  } finally{
    client.release();
  }
})
// 聯繫表單
router.post("/contact",async (req, res) => {
    /* 	
  #swagger.tags = ['user']
  #swagger.summary = '聯繫表單'
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["name","phone","email","msg"],
                properties: {
                    name: {
                        type: "string",
                        example: "阿明"
                    },
                    phone: {
                        type: "string",
                        example: "0912345678"
                    },
                    email: {
                        type: "string",
                        example: "test12345@gmail.com"
                    },
                    msg: {
                        type: "string",
                        example: "肚子好餓"
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
  logger.info('/api/user/contact',req.body)
  const { name, phone, email, msg } = req.body;
  if(!name||!phone||!email||!msg){
    logger.warn("缺少必要的資料")
    return sendError(res, response.missing_info, "缺少必要的資料")
  }
  if(name.length > 20) {
    logger.warn("姓名過長")
    return sendError(res, response.invalid_name, '姓名過長');
  }
  const phoneRegex = /^(09\d{8}|0\d{1,3}-?\d{6,8})$/;
  if (!phoneRegex.test(phone)) {
    logger.warn("電話號碼格式錯誤")
    return sendError(res, response.invalid_phone, '電話號碼格式錯誤');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    logger.warn("Email格式錯誤")
    return sendError(res, response.invalid_email, 'Email格式錯誤');
  }
  if(msg.length > 100) {
    logger.warn("訊息過長")
    return sendError(res, response.invalid_infos, '訊息過長');
  }
  try {
    const time = new Date().toISOString()
    await db.query(
      "INSERT INTO contacts (name, phone ,email ,msg ,time) VALUES ($1, $2, $3, $4, $5)",
      [name, phone, email, msg, time]
    );
    return res.status(200).json({
      code: response.success,
      msg: "訊息新增成功",
      data: {},
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, "伺服器錯誤，請稍後再試", 500);
  }
})
module.exports = router;
