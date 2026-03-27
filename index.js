const express = require("express");
const axios = require("axios");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

console.log("🚀 Server starting...");

// ===================
// 🔐 التشفير
// ===================
const algorithm = "aes-256-ctr";
const key = Buffer.from(process.env.SECRET_KEY, "hex");

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(hash) {
  const [ivHex, contentHex] = hash.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const content = Buffer.from(contentHex, "hex");
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
  return decrypted.toString("utf8");
}

// ===================
// 🧩 Model
// ===================
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  botToken: { type: String, required: true },
  chatId: { type: String, required: true },
  message: { type: String, required: true },
  interval: { type: Number, required: true } // بالثواني
});

const User = mongoose.model("User", userSchema);

// ===================
// ⏱️ Tasks
// ===================
let tasks = {};
let isDbConnected = false;

// ===================
// 🧪 Test Route
// ===================
app.get("/", (req, res) => {
  res.send("✅ Server is working");
});

// ===================
// 🔹 saveAndStart
// ===================
app.post("/saveAndStart", async (req, res) => {
  console.log("📥 /saveAndStart hit");

  if (!isDbConnected) return res.status(503).send("⏳ السيرفر مازال يتصل بقاعدة البيانات");

  try {
    const { userId, botToken, chatId, message, interval } = req.body;
    if (!userId || !botToken || !chatId || !message || !interval) {
      return res.status(400).send("❌ بيانات ناقصة");
    }

    const encryptedToken = encrypt(botToken);

    // 💾 حفظ المهمة كاملة في MongoDB
    await User.findOneAndUpdate(
      { userId },
      { userId, botToken: encryptedToken, chatId, message, interval },
      { upsert: true, returnDocument: "after" }
    );

    // 🔁 تشغيل interval جديد
    if (tasks[chatId]) clearInterval(tasks[chatId]);

    const sendMessage = async () => {
      try {
        const user = await User.findOne({ userId });
        if (!user || !user.botToken) return console.log("⚠️ User not found");
        const token = decrypt(user.botToken);

        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId,
          text: message,
        });

        console.log(`✅ Message sent to chatId ${chatId}`);
      } catch (err) {
        console.log("❌ Telegram Error:", err.message);
      }
    };

    // إرسال أول رسالة فوراً
    sendMessage();

    // بدء interval للنشر الدوري
    tasks[chatId] = setInterval(sendMessage, interval * 1000);

    res.send("✅ تم إعداد المستخدم وبدء النشر");

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).send("❌ خطأ في السيرفر");
  }
});

// ===================
// 🔹 stop
// ===================
app.post("/stop", (req, res) => {
  console.log("📥 /stop hit");

  const { chatId } = req.body;
  if (!chatId) return res.status(400).send("❌ لازم chatId");

  if (tasks[chatId]) {
    clearInterval(tasks[chatId]);
    delete tasks[chatId];
    return res.send("🛑 تم إيقاف النشر");
  }

  res.send("⚠️ لا يوجد Task");
});

// ===================
// 🚀 MongoDB Connection + استرجاع المهام عند بدء السيرفر
// ===================
mongoose.connect(process.env.MONGO_URI)
.then(async () => {
  console.log("✅ Connected to MongoDB");
  isDbConnected = true;

  // استرجاع كل المهام وتشغيلها تلقائياً
  const users = await User.find({});
  users.forEach(user => {
    const { userId, chatId, message, interval, botToken } = user;
    if (!tasks[chatId]) {
      const sendMessage = async () => {
        try {
          const token = decrypt(botToken);
          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text: message,
          });
          console.log(`✅ Message sent to chatId ${chatId}`);
        } catch (err) {
          console.log("❌ Telegram Error:", err.message);
        }
      };

      // إرسال أول رسالة فوراً
      sendMessage();

      // بدء interval
      tasks[chatId] = setInterval(sendMessage, interval * 1000);
    }
  });
})
.catch(err => console.error("❌ MongoDB Error:", err));

// ===================
// 🚀 تشغيل السيرفر
// ===================
const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});