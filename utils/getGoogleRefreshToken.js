const { google } = require("googleapis");
require('dotenv').config()
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// 產生授權 URL
// const authUrl = oAuth2Client.generateAuthUrl({
//   access_type: "offline",
//   scope: ["https://mail.google.com/"],
// });

// console.log("請用瀏覽器開啟此網址並取得授權碼：", authUrl);

// 拿到授權碼後，執行以下來換取 token
const code = '4/0AVMBsJgxZ0wOIbOU561opKHJUiKk-fn9PQh8dXR95EhvKE0uT2dsBZAkfq5CHYZMr7rEtA&scope=https://mail.google.com/'
async function getToken(code) {
  const { tokens } = await oAuth2Client.getToken(code);
  console.log("Access Token:", tokens.access_token);
  console.log("Refresh Token:", tokens.refresh_token);
  oAuth2Client.setCredentials(tokens);
}
getToken(code)
