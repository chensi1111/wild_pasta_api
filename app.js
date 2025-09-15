const cors = require('cors');
const express = require('express');
const logger= require('./logger');
const UAParser = require("ua-parser-js");
// const cron = require('node-cron');
// const setTimeSlotsCapacity = require('./utils/setTimeSlotsCapacity');
// const setTakeOutCapacity = require('./utils/setTakeOutCapacity')
const app = express();
const port = process.env.PORT || 3000;
const reserveRouter = require('./routes/reserve'); 
const userRouter = require('./routes/user');
const takeoutRouter = require('./routes/takeout')
const errorRouter = require('./routes/error')
const systemRouter = require('./routes/system')
const swaggerUi = require("swagger-ui-express");
const swaggerFile = require("./swagger-output.json");
// 排定每日0:00 執行
// cron.schedule('0 0 * * *', async () => {
//   try {
//     await setTimeSlotsCapacity();
//     await setTakeOutCapacity();
//     console.log('完成時段容量補足');
//     console.log(Date.now(),'目前時間');
//   } catch (err) {
//     console.error('執行排程時出錯:', err);
//   }
// });
const corsOptions = {
  origin: process.env.BASE_URL,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  // credentials: true
};

app.use(cors(corsOptions));
app.use(express.json()); 

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const parser = new UAParser(req.headers["user-agent"]);
    const uaResult = parser.getResult();
    const deviceType = uaResult.device.type || "desktop";
    const browserName = uaResult.browser.name || "unknown";
    const browserVersion = uaResult.browser.version || "unknown";
    const userId = req.user ? req.user.userId : "anonymous";

    let level = "info";
    if (res.statusCode >= 500) level = "error";
    else if (res.statusCode >= 400) level = "warn";

    logger.log({
      level,
      message: `${req.method} ${req.originalUrl}`,
      userId,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: { deviceType, browserName, browserVersion }
    });
  });

  next();
});
app.use('/api/reserve', reserveRouter); 
app.use('/api/user', userRouter);
app.use('/api/takeout', takeoutRouter);
app.use('/api/error', errorRouter);
app.use('/api/system', systemRouter);
// Swagger UI 路由
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerFile));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
