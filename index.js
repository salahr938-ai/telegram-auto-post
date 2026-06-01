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
  referralCode: { type: String, unique: true }, // 👈 ضروري: الكود الخاص بالمستخدم
  referredBy: { type: String, default: "" },    // 👈 ضروري: كود الشخص الذي دعاه
  points: { type: Number, default: 0 },
  referralStatus: { type: String, default: "pending" }, // ✅ أضفنا هذا الحقل
  spinsLeft: { type: Number, default: 0 },
  adsLeft: { type: Number, default: 5 },
  lastPrize: { type: String, default: "0" },
  resetTime: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) }
}, { timestamps: true });

const WheelUser = mongoose.model("WheelUser", wheelSchema);


function generateReferralCode(userId) {
    return userId.substring(0, 6).toUpperCase() + Math.floor(1000 + Math.random() * 9000);
}



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


// ===================================
// 🎁 مسار تقديم طلب السحب والخصم من MongoDB والتسجيل في الفايربيس
app.post("/api/referral/confirm", async (req, res) => {
  if (!isDbConnected) return res.status(503).send("⏳ DB not ready");

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).send("❌ userId required");

    // 1. جلب بيانات الشخص المدعو
    const user = await WheelUser.findOne({ userId });
    if (!user || user.referralStatus === "confirmed") return res.status(400).send("❌ الحالة غير صالحة");

    // 2. تحديث نقاط المدعو
    user.points += 5000;
    user.referralStatus = "confirmed";
    await user.save();

    // 3. منح مكافأة للشخص الذي قام بالدعوة (إذا وجد)
    // ملاحظة: يجب أن يكون لديك حقل referralCode في الـ Schema الخاص بك
    if (user.referredBy) {
      const inviter = await WheelUser.findOne({ referralCode: user.referredBy });
      if (inviter) {
        inviter.points += 5000;
        await inviter.save();
        console.log(`🎁 Bonus awarded to inviter: ${inviter.userId}`);
      }
    }

    // 4. تحديث الفايربيس (كمرجع إداري فقط)
    await firestore.collection("users").doc(userId).update({ referralStatus: "confirmed" });

    res.json({ success: true, newPoints: user.points });
  } catch (err) {
    console.log("❌ REFERRAL ERROR:", err);
    res.status(500).send("❌ خطأ في الخادم");
  }
});




// ===================================
// 📢 مسار تسجيل الإحالة الجديد (يتم استدعاؤه من التطبيق عند أول فتح)
// ===================================
app.post("/api/referral/register", async (req, res) => {
    if (!isDbConnected) return res.status(503).send("⏳ DB not ready");

    try {
        const { userId, referrerCode } = req.body;
        
        if (!userId || !referrerCode) {
            return res.status(400).send("❌ بيانات ناقصة");
        }

        // 1. نبحث عن المستخدم في قاعدة البيانات
        const user = await WheelUser.findOne({ userId });
        
        // 2. إذا كان موجوداً ولم يتم تسجيل "داعي" له من قبل
        if (user && (!user.referredBy || user.referredBy === "")) {
            user.referredBy = referrerCode;
            await user.save();
            console.log(`🔗 Referral registered: ${userId} invited by ${referrerCode}`);
            res.json({ success: true, message: "تم تسجيل الإحالة بنجاح" });
        } else {
            res.status(400).send("❌ الإحالة مسجلة مسبقاً أو المستخدم غير موجود");
        }
    } catch (err) {
        console.error("❌ REGISTER REFERRAL ERROR:", err);
        res.status(500).send("❌ خطأ في السيرفر");
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
            // هنا نستخدم الآلة التي صنعناها في الخطوة 1
            account = await WheelUser.create({ 
                userId, 
                spinsLeft: 3,
                referralCode: generateReferralCode(userId) 
            }); 
        }

        // هذا الجزء للتأكد من إعادة ضبط الإعلانات كل يوم
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