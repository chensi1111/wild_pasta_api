const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const logger = require('../logger')

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

async function sendMail(to, subject, html) {
  const accessToken = await oAuth2Client.getAccessToken();
  console.log(CLIENT_ID,CLIENT_SECRET,REDIRECT_URI,REFRESH_TOKEN,accessToken,'debug')

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: "chensiProjectTest4832@gmail.com",
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
      accessToken: accessToken.token,
    },
  });

  const mailOptions = {
    from: "WildPasta <chensiProjectTest4832@gmail.com>",
    to,
    subject,
    html,
  };

  const result = await transporter.sendMail(mailOptions);
  console.log("寄信成功:", result.response);
}
module.exports = sendMail;