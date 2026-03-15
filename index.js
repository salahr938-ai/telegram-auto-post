const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let tasks = [];

app.post("/start", (req, res) => {
  const { botToken, chatId, message, interval } = req.body;

  if (!botToken || !chatId || !message || !interval) {
    return res.status(400).send("الرجاء تعبئة كل الحقول");
  }

  console.log("تم استلام مهمة جديدة:");
  console.log("Bot Token:", botToken);
  console.log("Chat ID:", chatId);
  console.log("Message:", message);
  console.log("Interval (min):", interval);

  const intervalMs = interval * 60000;

  const timer = setInterval(async () => {
    try {
      const response = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: message
      });
      console.log("تم إرسال الرسالة بنجاح:", response.data);
    } catch (err) {
      console.error("فشل إرسال الرسالة:", err.message);
    }
  }, intervalMs);

  tasks.push(timer);
  res.send("تم بدء النشر التلقائي");
});

app.post("/stop", (req, res) => {
  tasks.forEach(timer => clearInterval(timer));
  tasks = [];
  res.send("تم إيقاف جميع النشر التلقائي");
});

app.listen(3000, () => console.log("Server running on port 3000"));
