const { google } = require("googleapis");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
function encodeRFC2047(str) {
  return `=?UTF-8?B?${Buffer.from(str).toString('base64')}?=`;
}

async function sendMail(to, subject, html) {
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
  // 編碼中文標題
  const encodedSubject = encodeRFC2047(subject);

  // 組成 raw email
  const emailLines = [];
  emailLines.push(`From: WildPasta <chensiProjectTest4832@gmail.com>`);
  emailLines.push(`To: ${to}`);
  emailLines.push(`Subject: ${encodedSubject}`);
  emailLines.push("Content-Type: text/html; charset=utf-8");
  emailLines.push("");
  emailLines.push(html);

  const email = emailLines.join("\n");

  const encodedEmail = Buffer.from(email)
    .toString("base64")           // Gmail API 要求 base64
    .replace(/\+/g, "-")          // URL-safe
    .replace(/\//g, "_")
    .replace(/=+$/, "");          // 去掉尾端 padding

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedEmail,
    },
  });

  console.log("寄信成功:", res.data);
}
module.exports = sendMail;