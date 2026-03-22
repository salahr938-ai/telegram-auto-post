const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ نخزن كل Task حسب chatId
let tasks = {};


// 🔹 بدء النشر
app.post("/start", (req, res) => {
  const { botToken, chatId, message, interval } = req.body;

  if (!botToken || !chatId || !message || !interval) {
    return res.status(400).send("الرجاء تعبئة كل الحقول");
  }

  console.log("📥 مهمة جديدة:");
  console.log("Chat ID:", chatId);
  console.log("Message:", message);
  console.log("Interval (sec):", interval);

  // ❗ إذا كاين Task قديم نحوه
  if (tasks[chatId]) {
    clearInterval(tasks[chatId]);
    console.log("♻️ تم حذف Task قديم لنفس الشات");
  }

  // ✅ نحسب بالثواني (تصحيح مهم)
  const intervalMs = interval * 1000;

  // 🚀 إنشاء Task جديد
  const timer = setInterval(async () => {
    try {
      const response = await axios.post(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          chat_id: chatId,
          text: message,
        }
      );

      console.log("✅ تم الإرسال:", response.data.result.message_id);

    } catch (err) {
      console.error("❌ خطأ في الإرسال:", err.message);
    }
  }, intervalMs);

  // 💾 نخزن الـ Task
  tasks[chatId] = timer;

  res.send("✅ تم بدء النشر التلقائي");
});


// 🔹 إيقاف النشر (Chat واحد)
app.post("/stop", (req, res) => {
  const { chatId } = req.body;

  if (!chatId) {
    return res.status(400).send("❌ لازم ترسل chatId");
  }

  if (tasks[chatId]) {
    clearInterval(tasks[chatId]);
    delete tasks[chatId];

    console.log("🛑 تم إيقاف النشر لـ:", chatId);
    return res.send("🛑 تم إيقاف النشر");
  }

  res.send("⚠️ لا يوجد Task لهذا الشات");
});


// 🔹 إيقاف كل شيء (اختياري)
app.post("/stopAll", (req, res) => {
  Object.values(tasks).forEach(timer => clearInterval(timer));
  tasks = {};

  console.log("🛑 تم إيقاف جميع المهام");
  res.send("🛑 تم إيقاف الكل");
});


// 🔹 تشغيل السيرفر
app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});