const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let tasks = []; // لتخزين المؤقتات لكل مهمة

// API لتشغيل النشر التلقائي
app.post("/start", (req, res) => {
  const { botToken, chatId, message, interval } = req.body;

  if (!botToken || !chatId || !message || !interval) {
    return res.status(400).send("الرجاء تعبئة كل الحقول");
  }

  const intervalMs = interval * 60000; // تحويل دقائق إلى ميلي ثانية

  // تشغيل المؤقت لإرسال الرسالة كل فترة
  const timer = setInterval(async () => {
    try {
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: message
      });
      console.log("Message sent to", chatId);
    } catch (err) {
      console.error("Failed to send message:", err.message);
    }
  }, intervalMs);

  // تخزين المؤقت ليتمكن من الإيقاف لاحقًا
  tasks.push(timer);

  res.send("تم بدء النشر التلقائي");
});

// API لإيقاف جميع المهام
app.post("/stop", (req, res) => {
  tasks.forEach(timer => clearInterval(timer));
  tasks = [];
  res.send("تم إيقاف جميع النشر التلقائي");
});

app.listen(3000, () => console.log("Server running on port 3000"));
