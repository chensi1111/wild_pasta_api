const express = require('express');
const { google } = require("googleapis");
require('dotenv').config()
const {verifyAPI} = require("../middleware/auth");
const logger=require('../logger');
const router = express.Router();
const db =require('../db')
const response=require('../utils/response_codes')
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

function sendError(res, code, msg, status = 400) {
  return res.status(status).json({ code, msg });
}

// 設定外帶容量設置
router.post("/takeout",verifyAPI, async (req, res) => {
  /* 	
  #swagger.tags = ['system']
  #swagger.summary = '設定外帶容量設置'
  #swagger.security = [{
    "ApiTokenAuth": []
  }] 

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
  const timeSlots = [
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00','15:30','16:00',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30','21:00'
  ];
  logger.info("/api/system/takeout");
  try {
    await db.query('DELETE FROM takeout_capacity');
    const localDate = dayjs().tz("Asia/Taipei").format("YYYY-MM-DD");
    for (const slot of timeSlots) {
      await db.query(
        `INSERT INTO takeout_capacity (time_slot, max_capacity,date) VALUES ($1, $2, $3)`,
        [slot, 30,localDate]
      );
    }
    res.status(200).json({
      code: response.success,
      msg: '更新成功',
      data: {}
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, '伺服器錯誤，請稍後再試', 500);
  }
});

// 設定訂位容量
router.post("/reserve",verifyAPI, async (req, res) => {
  /* 	
  #swagger.tags = ['system']
  #swagger.summary = '設定訂位容量'
  #swagger.security = [{
    "ApiTokenAuth": []
  }]  

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
  const timeSlots = [
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'
  ];
  logger.info("/api/system/reserve");
  try {
    await db.query('DELETE FROM time_slots_capacity WHERE date < CURRENT_DATE');
    const today = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 3);
  
    for(let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0,10); // YYYY-MM-DD
      
      // 檢查該日期是否已存在時段設定
      const result = await db.query('SELECT COUNT(*) as cnt FROM time_slots_capacity WHERE date = $1', [dateStr]);
      const cnt = parseInt(result.rows[0].cnt, 10);
       if(cnt === 0) {
        // 沒有資料，批次新增所有時段
        const values = [];
        const params = [];
        let paramIndex = 1;
  
        for (const ts of timeSlots) {
          values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
          params.push(dateStr, ts, 48);
        }
  
        const queryText = `INSERT INTO time_slots_capacity (date, time_slot, max_capacity) VALUES ${values.join(',')}`;
        await db.query(queryText, params);
      }
    }
    res.status(200).json({
      code: response.success,
      msg: '更新成功',
      data: {}
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, '伺服器錯誤，請稍後再試', 500);
  }
});
// 激活伺服器
router.post("/pin", async (req, res) => {
  /* 	
  #swagger.tags = ['system']
  #swagger.summary = '激活伺服器' 

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
    res.status(200).json({
      code: response.success,
      msg: '更新成功',
      data: {}
    });
});
// 取得gmail authUrl
router.post("/gmail-auth",verifyAPI, async (req, res) => {
  /* 	
  #swagger.tags = ['system']
  #swagger.summary = '取得gmail authUrl'
  #swagger.security = [{
    "ApiTokenAuth": []
  }]  

  #swagger.responses[200] = {
    description: "成功",
    content: {
        "application/json": {
            example: {
                code: "000",
                msg: "成功",
                data: {
                    auth:'url'
                }
            }
        }
    }
  } 
*/
  logger.info("/api/system/gmail-auth");
  try {
    
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://mail.google.com/"],
    });

    res.status(200).json({
      code: response.success,
      msg: '成功',
      data: {
        authUrl
    }
    });

  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, '伺服器錯誤，請稍後再試', 500);
  }
});
// 換取google token
router.post("/gmail-token",verifyAPI, async (req, res) => {
  /* 	
  #swagger.tags = ['system']
  #swagger.summary = '換取google token'
  #swagger.security = [{
    "ApiTokenAuth": []
  }] 
  
  #swagger.requestBody = {
    required: true,
      content: {
        "application/json": {
            schema: {
                type: "object",
                required: ["code"],
                properties: {
                    code: {
                      type: "string",
                      example: "1234"
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
                    refresh_token:'token'
                }
            }
        }
    }
  } 
*/
  logger.info("/api/system/gmail-token",req.body);
  const { code } = req.body;
  try {
    let decodedCode = decodeURIComponent(code);
    const { tokens } = await oAuth2Client.getToken(decodedCode);
    oAuth2Client.setCredentials(tokens);

    res.status(200).json({
      code: response.success,
      msg: '成功',
      data: {
        refresh_token:tokens.refresh_token
    }
    });
  } catch (error) {
    logger.error(error)
    return sendError(res, response.server_error, '伺服器錯誤，請稍後再試', 500);
  }
});
module.exports = router;