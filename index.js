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
// 🔐 ENCRYPTION
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
  return Buffer.concat([decipher.update(content), decipher.final()]).toString("utf8");
}

// ===================
// MODEL
// ===================
const userSchema = new mongoose.Schema({
  userId: String,
  botToken: String,
  chatId: String,
  message: String,
  interval: Number
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

// ===================
// TASKS
// ===================
const tasks = new Map();

// ===================
// SEND MESSAGE
// ===================
async function sendTelegramMessage(user, attempt = 1) {
  try {
    const token = decrypt(user.botToken);

    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: user.chatId,
      text: user.message,
    });

  } catch (err) {
    if (attempt < 5) {
      setTimeout(() => sendTelegramMessage(user, attempt + 1), 10000);
    }
  }
}

// ===================
// START TASK
// ===================
function startTask(user) {
  const key = user._id.toString();

  if (tasks.has(key)) {
    clearInterval(tasks.get(key));
  }

  sendTelegramMessage(user);

  const interval = setInterval(() => {
    sendTelegramMessage(user);
  }, user.interval * 1000);

  tasks.set(key, interval);
}

// ===================
// SAVE + START
// ===================
app.post("/saveAndStart", async (req, res) => {
  try {
    const { userId, botToken, chatId, message, interval } = req.body;

    if (!userId || !botToken || !chatId || !message || !interval) {
      return res.status(400).send("❌ missing data");
    }

    const user = await User.create({
      userId,
      botToken: encrypt(botToken),
      chatId,
      message,
      interval
    });

    startTask(user);

    res.json({ id: user._id });

  } catch (e) {
    res.status(500).send("error");
  }
});

// ===================
// STOP (FIXED)
// ===================
app.post("/stop", async (req, res) => {
  const { chatId } = req.body;

  if (!chatId) return res.status(400).send("missing chatId");

  const users = await User.find({ chatId });

  users.forEach(user => {
    const key = user._id.toString();

    if (tasks.has(key)) {
      clearInterval(tasks.get(key));
      tasks.delete(key);
    }
  });

  res.send("stopped");
});

// ===================
// DELETE USER (FIXED NAME MATCH)
// ===================
app.post("/deleteUserData", async (req, res) => {
  const { userId } = req.body;

  if (!userId) return res.status(400).send("missing userId");

  try {
    const users = await User.find({ userId });

    users.forEach(user => {
      const key = user._id.toString();

      if (tasks.has(key)) {
        clearInterval(tasks.get(key));
        tasks.delete(key);
      }
    });

    await User.deleteMany({ userId });

    res.send("deleted");

  } catch (e) {
    res.status(500).send("error");
  }
});

// ===================
// DB
// ===================
mongoose.connect(process.env.MONGO_URI)
.then(async () => {
  console.log("✅ MongoDB connected");

  const users = await User.find({});
  users.forEach(startTask);

})
.catch(console.log);

// ===================
// SERVER
// ===================
app.listen(3000, "0.0.0.0", () => {
  console.log("🚀 running");
});