const express = require("express");
const axios = require("axios");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("crypto");
require("dotenv").config();


// ===================
// 🔥 FIREBASE ADMIN CONFIG
// ===================
const admin = require("firebase-admin");

// تنبيه: ستحتاج لتحميل ملف الـ JSON الخاص بالحساب الخدمي من الفايربيس وتسميته serviceAccountKey.json وضعه بجانب هذا الملف
const serviceAccount = require("./serviceAccountKey.json"); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const firestore = admin.firestore();


// 🔥 مهم جداً (إيقاف auto index)
mongoose.set('autoIndex', false);

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
  return Buffer.concat([decipher.update(content), decipher.final()]).toString("utf8");
}

// ===================
// 🧩 Model
// ===================
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  botToken: { type: String, required: true },
  chatId: { type: String, required: true },
  message: { type: String, required: true },
  interval: { type: Number, required: true }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

//كود خاص بالنقاط 
const wheelSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  points: { type: Number, default: 0 },
  spinsLeft: { type: Number, default: 0 },
  adsLeft: { type: Number, default: 5 },
  lastPrize: { type: String, default: "0" },
  resetTime: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) }
}, { timestamps: true });

const WheelUser = mongoose.model("WheelUser", wheelSchema);






// ===================
// ⏱️ Tasks
// ===================
const tasks = new Map();
let isDbConnected = false;

// ===================
// 🧪 Test Route
// ===================
app.get("/", (req, res) => {
  console.log("🔥 ROOT HIT");
  res.send("✅ Server is working");
});

// ===================
// 🔹 GET ORDERS
// ===================
// ===================================
// 🤝 مسار تأكيد الإحالة ومنح البونص (اقتصادي وآمن)
// ===================================
app.post("/api/referral/confirm", async (req, res) => {
  if (!isDbConnected) return res.status(503).send("⏳ DB not ready");

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).send("❌ userId required");

    // 1. التحقق من حساب المستخدم في MongoDB وزيادة رصيده بـ 5000 نقطة
    const account = await WheelUser.findOne({ userId });
    if (!account) return res.status(404).send("❌ مستخدم العجلة غير موجود");

    account.points += 5000;
    await account.save();

    // 2. تحديث حالة الإحالة في الفايربيس (تم تعديل document إلى doc لـ Node.js)
    const userFirebaseRef = firestore.collection("users").doc(userId); 
    await userFirebaseRef.update({
      referralStatus: "confirmed"
    });

    console.log(`✅ Referral confirmed and 5000 points added to ${userId}`);
    res.json({ success: true, newPoints: account.points });

  } catch (err) {
    console.log("❌ REFERRAL CONFIRM ERROR:", err);
    res.status(500).send("❌ خطأ في الخادم");
  }
});


// ===================================
// 🎁 مسار تقديم طلب السحب والخصم من MongoDB والتسجيل في الفايربيس
// ===================================
app.post("/api/wheel/withdraw", async (req, res) => {
  if (!isDbConnected) return res.status(503).send("⏳ DB not ready");

  try {
    const { userId, points, wallet } = req.body;
    if (!userId || !points || !wallet) return res.status(400).send("❌ بيانات ناقصة");

    // 1. جلب الحساب من MongoDB للتحقق من كفاية الرصيد الحقيقي
    const account = await WheelUser.findOne({ userId });
    if (!account) return res.status(404).send("❌ المستخدم غير موجود");

    if (account.points < points) {
      return res.status(400).send("⚠️ رصيدك الحالي في المونجو غير كافٍ!");
    }

    // 2. خصم النقاط من المونجو وحفظ التحديث مجاناً
    account.points -= parseInt(points);
    await account.save();

    // 3. إدراج طلب السحب في قاعدة بيانات الفايربيس بوضعية المعلق (pending)
    const redeemRef = firestore.collection("redeem_requests").doc(); 
    await redeemRef.set({
      uid: userId,
      points: parseInt(points),
      wallet: wallet,
      status: "pending",
      createdAt: new Date().toISOString()
    });

    console.log(`🎁 Redeem request created for ${userId}, deducted: ${points}`);
    res.json({ success: true, newPoints: account.points });

  } catch (err) {
    console.log("❌ WITHDRAW ERROR:", err);
    res.status(500).send("❌ خطأ في الخادم");
  }
});
// ===================
// 🔹 إرسال رسالة
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
    console.log(`❌ ERROR attempt ${attempt}:`, err.message);

    if (attempt < 5) {
      setTimeout(() => sendTelegramMessage(user, attempt + 1), 10000);
    }
  }
}

// ===================
// 🔹 تشغيل مهمة
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
// 🔹 saveAndStart
// ===================
app.post("/saveAndStart", async (req, res) => {
  if (!isDbConnected) return res.status(503).send("⏳ DB not ready");

  try {
    const { userId, botToken, chatId, message, interval } = req.body;

    if (!userId || !botToken || !chatId || !message || !interval) {
      return res.status(400).send("❌ بيانات ناقصة");
    }

    const orderCount = await User.countDocuments({ userId });
    if (orderCount >= 5) {
      return res.status(400).send("⚠️ الحد الأقصى 5 طلبات");
    }

    const encryptedToken = encrypt(botToken);

    const user = await User.create({
      userId,
      botToken: encryptedToken,
      chatId,
      message,
      interval
    });

    startTask(user);

    res.json(user);

  } catch (err) {
    console.log("❌ SERVER ERROR:", err);
    res.status(500).send("❌ خطأ");
  }
});

// ===================================
// 🎡 مسارات العجلة والنقاط (LUCKY WHEEL)
// ===================================

app.get("/api/wheel/status", async (req, res) => {
  if (!isDbConnected) return res.status(503).send("⏳ DB not ready");
  
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).send("❌ userId required");

    let account = await WheelUser.findOne({ userId });

    if (!account) {
      account = await WheelUser.create({ userId, spinsLeft: 3 }); 
    }

    if (new Date() >= account.resetTime) {
      account.adsLeft = 5;
      account.resetTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await account.save();
    }

    res.json(account);
  } catch (err) {
    console.log("❌ GET WHEEL ERROR:", err);
    res.status(500).send("❌ خطأ");
  }
});

app.post("/api/wheel/spin", async (req, res) => {
  if (!isDbConnected) return res.status(503).send("⏳ DB not ready");

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).send("❌ userId required");

    const account = await WheelUser.findOne({ userId });
    if (!account) return res.status(404).send("❌ غير موجود");

    if (account.spinsLeft <= 0) {
      return res.status(400).send("⚠️ لا توجد محاولات متبقية");
    }

    const prizes = ["0", "5", "10", "20", "50", "100"];
    const randomIndex = Math.floor(Math.random() * prizes.length);
    const reward = parseInt(prizes[randomIndex]);

    account.spinsLeft -= 1;
    account.points += reward;
    account.lastPrize = `${reward} Points`;
    await account.save();

    res.json({
      index: randomIndex, 
      newPoints: account.points,
      spinsLeft: account.spinsLeft,
      lastPrize: account.lastPrize
    });

  } catch (err) {
    console.log("❌ SPIN ERROR:", err);
    res.status(500).send("❌ خطأ");
  }
});

app.post("/api/wheel/watch-ad", async (req, res) => {
  if (!isDbConnected) return res.status(503).send("⏳ DB not ready");

  try {
    const { userId } = req.body;
    const account = await WheelUser.findOne({ userId });

    if (!account) return res.status(404).send("❌ غير موجود");
    if (account.adsLeft <= 0) return res.status(400).send("⚠️ انتهت إعلانات اليوم");

    account.adsLeft -= 1;
    account.spinsLeft += 1;
    await account.save();

    res.json(account);
  } catch (err) {
    res.status(500).send("❌ خطأ");
  }
});






// ===================
// 🔹 STOP
// ===================
app.post("/stop", (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).send("❌ لازم id");

  if (tasks.has(id)) {
    clearInterval(tasks.get(id));
    tasks.delete(id);
    return res.send("🛑 تم الإيقاف");
  }

  res.send("⚠️ لا يوجد Task");
});

// ===================
// 🔹 START
// ===================
app.post("/start", async (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).send("❌ لازم id");

  try {
    const user = await User.findById(id);

    if (!user) return res.status(404).send("❌ مش موجود");

    startTask(user);

    res.send("▶️ Task started");

  } catch (err) {
    console.log("❌ Start Error:", err);
    res.status(500).send("❌ خطأ");
  }
});

// ===================
// 🔹 DELETE USER
// ===================
app.post("/deleteUser", async (req, res) => {
  const { userId } = req.body;

  if (!userId) return res.status(400).send("❌ لازم userId");

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

    res.send("✅ تم حذف كل الطلبات");

  } catch (err) {
    console.log("❌ Delete Error:", err);
    res.status(500).send("❌ خطأ");
  }
});

// ===================
// 🔹 DELETE TOKEN ONLY
// ===================
app.post("/deleteTokenOnly", async (req, res) => {
  const { userId } = req.body;

  if (!userId) return res.status(400).send("❌ userId missing");

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

    res.send("✅ تم مسح التوكن والبيانات");

  } catch (err) {
    console.error("❌ خطأ:", err);
    res.status(500).send("❌ فشل");
  }
});

// ===================
// 🔹 DELETE SINGLE ORDER
// ===================
app.post("/deleteSingleOrder", async (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).send("❌ id missing");

  try {
    if (tasks.has(id)) {
      clearInterval(tasks.get(id));
      tasks.delete(id);
    }

    const result = await User.findByIdAndDelete(id);

    if (result) {
      res.send("✅ تم حذف البطاقة");
    } else {
      res.status(404).send("⚠️ غير موجود");
    }
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).send("❌ فشل");
  }
});

// ===================
// 🚀 MongoDB
// ===================
mongoose.connect(process.env.MONGO_URI)
.then(async () => {
  console.log("✅ Connected to MongoDB");
  isDbConnected = true;

  // 🔥 حذف index القديم (المهم)
  try {
    const indexes = await User.collection.indexes();
    const userIdIndex = indexes.find(i => i.name === "userId_1");

    if (userIdIndex) {
      await User.collection.dropIndex("userId_1");
      console.log("🗑️ Removed old unique index");
    } else {
      console.log("ℹ️ Index already removed");
    }
  } catch (e) {
    console.log("⚠️ Index remove error:", e.message);
  }

  const users = await User.find({});
  console.log(`🔄 Restoring ${users.length} tasks...`);

  users.forEach(user => startTask(user));

})
.catch(err => console.log("❌ MongoDB Error:", err));

// ===================
// 🚀 SERVER
// ===================
const PORT = 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server running on port ${PORT}`)
);