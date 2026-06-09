const express = require("express");
const axios = require("axios");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("crypto");
require("dotenv").config();


// ===================
// 🔥 FIREBASE ADMIN CONFIG
// ===================
// ===================
// 🔥 FIREBASE ADMIN CONFIG
// ===================
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount)
});

const firestore = getFirestore();


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
  referralCode: { type: String, unique: true },          // الكود الخاص بالمستخدم
  referredBy: { type: String, default: "" },             // 👈 هكذا الاسم الصحيح (الشخص لي دعاه)
  points: { type: Number, default: 0 },
  referralStatus: { type: String, default: "none" },      // 👈 الحالة الافتراضية الصحيحة "none"
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
mongoose.connection.on("connected", () => { isDbConnected = true; });
mongoose.connection.on("disconnected", () => { isDbConnected = false; });

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



app.get("/orders", async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).send("❌ userId missing");
        
        const userOrders = await User.find({ userId });
        res.json(userOrders);
    } catch (err) {
        console.error("❌ GET ORDERS ERROR:", err); // يطبع الخطأ في الـ Terminal لو صرا مشكل
        res.status(500).send("خطأ في الخادم");
    }
});









// ===================================
// 🎁 مسار تقديم طلب السحب والخصم من MongoDB والتسجيل في الفايربيس
// 🎁 مسار تقديم طلب السحب والخصم
app.post("/api/referral/confirm", async (req, res) => {
  if (!isDbConnected) return res.status(503).send("⏳ DB not ready");

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).send("❌ userId required");

    // 1. جلب بيانات المستخدم أولاً من قاعدة البيانات
    const user = await WheelUser.findOne({ userId });

    // 2. التحقق من وجود المستخدم
    if (!user) return res.status(404).send("❌ المستخدم غير موجود");
    
    // 3. 🛑 شرط الحماية: يجب أن يكون لديه "داعي" (referredBy) وحالته "pending"
    if (!user.referredBy || user.referralStatus !== "pending") {
       return res.status(400).send("❌ لا يمكنك التحصيل: إما لا توجد دعوة أو تم التحصيل مسبقاً");
    }

    // 4. تحديث نقاط المدعو
    user.points += 5000;
    user.referralStatus = "confirmed";
    await user.save();

    // 5. منح مكافأة للشخص الذي قام بالدعوة
    const inviter = await WheelUser.findOne({ referralCode: user.referredBy });
    if (inviter) {
      inviter.points += 5000;
      await inviter.save();
      console.log(`🎁 Bonus awarded to inviter: ${inviter.userId}`);
    }

    // 6. تحديث الفايربيس (اختياري)
    try {
        await firestore.collection("users").doc(userId).update({ referralStatus: "confirmed" });
    } catch (e) {
        console.log("⚠️ Firebase update skipped (user not in FB)");
    }

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

        const user = await WheelUser.findOne({ userId });
        
        if (user && (!user.referredBy || user.referredBy === "")) {
            user.referredBy = referrerCode;
            user.referralStatus = "pending"; // 👈 تفعيل الحالة هنا لكي يظهر زر التحصيل بالأندرويد!
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
            // 1. نضع كوداً احتياطياً تحسباً لأي مشكلة في الاتصال بالفايربيس
            let finalCode = generateReferralCode(userId); 

            try {
                // 2. السيرفر يتصل بالفايربيس ليقرأ الوثيقة التي أنشأها الأندرويد في LoginActivity
                const userDoc = await firestore.collection("users").doc(userId).get();
                
                // 3. إذا وجدنا الحساب في الفايربيس، نأخذ الكود الأصلي (referralCode) الذي خلقه الأندرويد
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    if (userData.referralCode) {
                        finalCode = userData.referralCode; // 👈 تم جلب الكود الصحيح والموحد!
                    }
                }
            } catch (fbErr) {
                console.log("⚠️ تعذر جلب الكود من الفايربيس، سيتم استخدام الكود الاحتياطي بالسيرفر");
            }

            // 4. الآن ننشئ الحساب في المونجو دي بي بالكود الموحد والصحيح
            account = await WheelUser.create({ 
                userId, 
                spinsLeft: 3,
                referralCode: finalCode // هكذا أصبح الكود في المونجو مطابقاً تماماً لكود الفايربيس
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

// ===================================
// 🎁 مسار تقديم طلب السحب والخصم من MongoDB والتسجيل في الفايربيس
// ===================================
app.post("/api/wheel/withdraw", async (req, res) => {
    if (!isDbConnected) return res.status(503).send("⏳ قاعدة البيانات غير جاهزة");

    try {
        const { userId, points, wallet } = req.body;

        // 1. التحقق من وصول البيانات الأساسية من الأندرويد
        if (!userId || !points || !wallet) {
            return res.status(400).send("❌ بيانات الطلب ناقصة");
        }

        const requestedPoints = parseInt(points);
        if (isNaN(requestedPoints) || requestedPoints <= 0) {
            return res.status(400).send("❌ كمية النقاط المطلوبة غير صالحة");
        }

        // 2. البحث عن الحساب في قاعدة البيانات (MongoDB)
        const account = await WheelUser.findOne({ userId });
        if (!account) {
            return res.status(404).send("❌ الحساب غير موجود في السيرفر");
        }

        // 3. الفحص الأمني: التأكد من أن رصيد النقاط يكفي السحب
        if (account.points < requestedPoints) {
            return res.status(400).send("❌ رصيد نقاطك الحالي في السيرفر غير كافٍ!");
        }

        // 4. الخصم وحفظ التحديثات في المونجو دي بي
        account.points -= requestedPoints;
        await account.save();

        // 5. تسجيل الطلب في الفايربيس (Firestore) لكي يظهر في الإدارة وسجل الطلبات
        try {
            await firestore.collection("redeem_requests").add({
                userId: userId,
                points: requestedPoints,
                wallet: wallet,
                status: "pending", // معلق حتى تتم مراجعته يدوياً من قبلك
                createdAt: new Date()
            });
            console.log(`✅ Withdraw request logged in Firebase for user: ${userId}`);
        } catch (fbErr) {
            console.log("⚠️ تم خصم النقاط بنجاح ولكن تعذر التسجيل بالفايربيس:", fbErr.message);
        }

        // 6. الرد على الأندرويد بالنجاح وإرسال الرصيد الجديد المتبقي
        res.json({ 
            success: true, 
            newPoints: account.points,
            message: "تم الخصم وتسجيل طلب السحب بنجاح" 
        });
    } catch (err) {
        console.error("❌ WITHDRAW ROUTE ERROR:", err);
        res.status(500).send("❌ خطأ داخلي في السيرفر أثناء معالجة السحب");
    }
});




// ... (هذا هو المكان الصحيح لوضع المسار)

// ===================================
// ❌ مسار رفض طلب السحب وإرجاع النقاط في MongoDB
// ===================================
app.post("/api/wheel/reject", async (req, res) => {
    if (!isDbConnected) return res.status(503).send("⏳ قاعدة البيانات غير جاهزة");

    try {
        const { requestId, userId, points } = req.body;

        if (!requestId || !userId || !points) {
            return res.status(400).send("❌ بيانات الرفض ناقصة");
        }

        const pointsToReturn = parseInt(points);

        // 1. إعادة النقاط للمستخدم في MongoDB
        const account = await WheelUser.findOne({ userId });
        if (account) {
            account.points += pointsToReturn;
            await account.save();
            console.log(`🔄 Returned ${pointsToReturn} points to MongoDB user: ${userId}`);
        }

        // 2. تحديث حالة الطلب في الفايربيس إلى مرفوض
        try {
            await firestore.collection("redeem_requests").doc(requestId).update({
                status: "rejected"
            });
            console.log(`✅ Request ${requestId} marked as rejected`);
        } catch (fbErr) {
            console.error("❌ فشل تحديث الفايربيس:", fbErr.message);
        }

        res.json({ success: true, message: "تم الرفض وإرجاع النقاط بنجاح" });

    } catch (err) {
        console.error("❌ REJECT ROUTE ERROR:", err);
        res.status(500).send("❌ خطأ داخلي في السيرفر");
    }
});


app.post("/api/user/init", async (req, res) => {
    const { userId } = req.body;
    try {
        let user = await WheelUser.findOne({ userId });
        if (!user) {
            // إنشاء المستخدم في MongoDB فوراً وبقيم افتراضية
            await WheelUser.create({ 
                userId: userId, 
                points: 0, 
                spinsLeft: 3 // أو القيمة الابتدائية عندك
            });
            console.log("تم إنشاء مستخدم جديد في MongoDB: " + userId);
        }
        res.status(200).send("User Initialized");
    } catch (err) {
        res.status(500).send("Error");
    }
});




// ===================
// 🔹 STOP (أكمل من هنا بقية الكود)
// ===================





// ===================
// 🔹 STOP
// ===================
app.post("/stop", (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).send("❌ لازم id");

  // تحويل المعرف إلى نص لضمان المطابقة مع مفاتيح الخريطة
  const taskKey = id.toString();

  if (tasks.has(taskKey)) {
    clearInterval(tasks.get(taskKey));
    tasks.delete(taskKey);
    return res.send("🛑 تم الإيقاف بنجاح");
  }

  res.send("⚠️ لا توجد مهمة نشطة حالياً لهذا المعرّف");
});

// ===================
// 🔹 START
// ===================
app.post("/start", async (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).send("❌ لازم id");

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).send("❌ الطلب غير موجود في قاعدة البيانات");

    startTask(user);
    res.send("▶️ تم تشغيل المهمة بنجاح");

  } catch (err) {
    console.log("❌ Start Error:", err);
    res.status(500).send("❌ خطأ في السيرفر");
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
    const taskKey = id.toString(); // تحويله لنص لضمان المطابقة في الـ Map

    if (tasks.has(taskKey)) {
      clearInterval(tasks.get(taskKey));
      tasks.delete(taskKey);
    }

    const result = await User.findByIdAndDelete(id);

    if (result) {
      res.send("✅ تم حذف البطاقة والمهمة بنجاح");
    } else {
      res.status(404).send("⚠️ غير موجود");
    }
  } catch (err) {
    console.error("❌ Delete Single Order Error:", err);
    res.status(500).send("❌ خطأ في السيرفر أثناء الحذف");
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