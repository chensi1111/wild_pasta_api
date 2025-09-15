const swaggerAutogen = require("swagger-autogen")({ openapi: "3.0.0" });

const doc = {
  info: {
    title: "Wild Pasta API",
    description: "Wild Pasta 訂單系統 API 文件",
    version: "1.0.0",
  },
  servers: [
    {
      url: "http://localhost:80",
      description: "Local Server",
    },
    {
      url: "https://wild-pasta-api.onrender.com", // Render 部署
      description: "Production Server",
    },
  ],
  tags: [
    {
      name: "user",
    },
    {
      name: "reserve",
    },
    {
      name: "takeout",
    },
    {
      name: "system"
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    }
  }
};

const outputFile = "./swagger-output.json"; // 產生的文件
const endpointsFiles = ["./app.js"]; // 指定你的 API 入口

swaggerAutogen(outputFile, endpointsFiles, doc);
