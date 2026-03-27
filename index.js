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
  interval: { type: Number, required: true }
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
// 🔹 إرسال رسالة مع Retry
// ===================
async function sendTelegramMessage(user, attempt = 1) {
  try {
    const token = decrypt(user.botToken);

    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: user.chatId,
      text: user.message,
    });

    console.log(`✅ Message sent to ${user.chatId}`);

  } catch (err) {
    console.log(`❌ ERROR attempt ${attempt} for ${user.chatId}:`, err.response?.data || err.message);

    // Retry 5 مرات مع تأخير 10 ثواني
    if (attempt < 5) {
      console.log(`🔄 Retrying message to ${user.chatId} in 10s...`);
      setTimeout(() => {
        sendTelegramMessage(user, attempt + 1);
      }, 10000);
    } else {
      console.log(`⚠️ Failed to send message to ${user.chatId} after 5 attempts.`);
    }
  }
}

// ===================
// 🔹 تشغيل مهمة
// ===================
function startTask(user) {
  if (tasks[user.chatId]) clearInterval(tasks[user.chatId]);

  // أول إرسال
  sendTelegramMessage(user);

  // التكرار
  tasks[user.chatId] = setInterval(() => {
    sendTelegramMessage(user);
  }, user.interval * 1000);
}

// ===================
// 🔹 saveAndStart
// ===================
app.post("/saveAndStart", async (req, res) => {
  console.log("📥 /saveAndStart hit");

  if (!isDbConnected) {
    return res.status(503).send("⏳ السيرفر مازال يتصل بقاعدة البيانات");
  }

  try {
    const { userId, botToken, chatId, message, interval } = req.body;

    if (!userId || !botToken || !chatId || !message || !interval) {
      return res.status(400).send("❌ بيانات ناقصة");
    }

    const encryptedToken = encrypt(botToken);

    const user = await User.findOneAndUpdate(
      { userId },
      { userId, botToken: encryptedToken, chatId, message, interval },
      { upsert: true, returnDocument: 'after' } // بدل new: true حسب التحذير
    );

    startTask(user);

    res.send("✅ تم بدء النشر");

  } catch (err) {
    console.log("❌ SERVER ERROR:", err);
    res.status(500).send("❌ خطأ في السيرفر");
  }
});

// ===================
// 🔹 stop
// ===================
app.post("/stop", async (req, res) => {
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
// 🚀 MongoDB + استرجاع المهام
// ===================
mongoose.connect(process.env.MONGO_URI)
.then(async () => {
  console.log("✅ Connected to MongoDB");
  isDbConnected = true;

  const users = await User.find({});

  console.log(`🔄 Restoring ${users.length} tasks...`);

  users.forEach(user => {
    startTask(user);
  });

})
.catch(err => {
  console.log("❌ MongoDB Error:", err);
});

// ===================
// 🚀 تشغيل السيرفر
// ===================
const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});