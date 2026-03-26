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

  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final()
  ]);

  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(hash) {
  const [ivHex, contentHex] = hash.split(":");

  const iv = Buffer.from(ivHex, "hex");
  const content = Buffer.from(contentHex, "hex");

  const decipher = crypto.createDecipheriv(algorithm, key, iv);

  const decrypted = Buffer.concat([
    decipher.update(content),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

// ===================
// 🔗 MongoDB
// ===================
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ Connected to MongoDB"))
.catch(err => console.log("❌ MongoDB Error:", err));

// ===================
// 🧩 Model
// ===================
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  botToken: { type: String, required: true }
});

const User = mongoose.model("User", userSchema);

// ===================
// ⏱️ Tasks
// ===================
let tasks = {};

// ===================
// 🧪 Test
// ===================
app.get("/", (req, res) => {
  res.send("✅ Server is working");
});

// ===================
// 🔥 saveAndStart (الأهم)
// ===================
app.post("/saveAndStart", async (req, res) => {
  console.log("📥 /saveAndStart hit");

  try {
    const { userId, botToken, chatId, message, interval } = req.body;

    if (!userId || !botToken || !chatId || !message || !interval) {
      return res.status(400).send("❌ بيانات ناقصة");
    }

    // 🔐 تشفير التوكن
    const encryptedToken = encrypt(botToken);

    // 💾 تخزين
    await User.findOneAndUpdate(
      { userId },
      { userId, botToken: encryptedToken },
      { upsert: true, new: true }
    );

    // ⛔ إيقاف القديم
    if (tasks[chatId]) {
      clearInterval(tasks[chatId]);
    }

    // 🚀 تشغيل
    const timer = setInterval(async () => {
      try {
        await axios.post(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            chat_id: chatId,
            text: message,
          }
        );
        console.log("✅ Message sent");
      } catch (err) {
        console.log("❌ Telegram Error:", err.message);
      }
    }, interval * 1000);

    tasks[chatId] = timer;

    res.send("✅ تم الحفظ وبدء النشر");

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).send("❌ خطأ في السيرفر");
  }
});

// ===================
// 🛑 Stop
// ===================
app.post("/stop", (req, res) => {
  console.log("📥 /stop hit");

  const { chatId } = req.body;

  if (!chatId) {
    return res.status(400).send("❌ لازم chatId");
  }

  if (tasks[chatId]) {
    clearInterval(tasks[chatId]);
    delete tasks[chatId];
    return res.send("🛑 تم الإيقاف");
  }

  res.send("⚠️ لا يوجد Task");
});

// ===================
// 🗑️ Delete Token
// ===================
app.post("/deleteToken", async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).send("❌ userId مطلوب");
  }

  await User.deleteOne({ userId });

  res.send("🗑️ تم حذف التوكن");
});

// ===================
// 🚀 تشغيل
// ===================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});