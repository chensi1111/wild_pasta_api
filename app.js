const cors = require('cors');
const express = require('express');
const logger= require('./logger');
const UAParser = require("ua-parser-js");
const app = express();
const cookieParser = require("cookie-parser")
const port = process.env.PORT || 3000;
const reserveRouter = require('./routes/reserve'); 
const userRouter = require('./routes/user');
const takeoutRouter = require('./routes/takeout')
const errorRouter = require('./routes/error')
const systemRouter = require('./routes/system')
const swaggerUi = require("swagger-ui-express");
const swaggerFile = require("./swagger-output.json");
const corsOptions = {
  origin: process.env.BASE_URL,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cookieParser());
app.use(cors(corsOptions));
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

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
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

    logger.log({
      level,
      message: `${req.method} ${req.originalUrl}`,
      userId,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip,
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
