const cors = require('cors');
const express = require('express');
const cron = require('node-cron');
const setTimeSlotsCapacity = require('./utils/setTimeSlotsCapacity');
const setTakeOutCapacity = require('./utils/setTakeOutCapacity')
const app = express();
const PORT = 80;
const reserveRouter = require('./routes/reserve'); 
const userRouter = require('./routes/user');
const takeoutRouter = require('./routes/takeout')
const errorRouter = require('./routes/error')
const swaggerUi = require("swagger-ui-express");
const swaggerFile = require("./swagger-output.json");
// 排定每日0:00 執行
cron.schedule('0 0 * * *', async () => {
  try {
    await setTimeSlotsCapacity();
    await setTakeOutCapacity();
    console.log('完成時段容量補足');
    console.log(Date.now(),'目前時間');
  } catch (err) {
    console.error('執行排程時出錯:', err);
  }
});
app.use(cors({
    origin: '*' ,
    methods: ['GET', 'POST', 'OPTIONS'],
  }));
app.use(express.json()); 
app.use('/api/reserve', reserveRouter); 
app.use('/api/user', userRouter);
app.use('/api/takeout', takeoutRouter);
app.use('/api/error', errorRouter);
// Swagger UI 路由
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerFile));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
// (async () => {
//   try {
//     await setTimeSlotsCapacity();
//   } catch (error) {
//     console.error('啟動時 setTimeSlotsCapacity 出錯:', error);
//   }
// })();

// (async () => {
//   try {
//     await setTakeOutCapacity();
//   } catch (error) {
//     console.error('啟動時 setTakeOutCapacity 出錯:', error);
//   }
// })();