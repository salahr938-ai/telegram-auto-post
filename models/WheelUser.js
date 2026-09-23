const mongoose = require("mongoose"); // 1️⃣ استدعاء المانغوس (إجباري في كل موديل)

// كود خاص بالنقاط والمسابقات
const wheelSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  referralCode: { type: String, unique: true },          // الكود الخاص بالمستخدم
  referredBy: { type: String, default: "" },             // الشخص لي دعاه
  points: { type: Number, default: 0 },
  referralStatus: { type: String, default: "none" },     // الحالة الافتراضية الصحيحة "none"
  
  // حقول عجلة الحظ والمؤقتات الجديدة
  spinsLeft: { type: Number, default: 1 },               // بدأناها بـ 1 افتراضياً
  lastSpinTime: { type: Date, default: null },           // لتخزين وقت آخر لفة مجانية
  nextSpinTime: { type: Date, default: Date.now },       // 👈 موعد اللفة المجانية القادمة (مهم للكنترولر)
  adsWatchedToday: { type: Number, default: 0 },         // عدد الإعلانات المشاهدة اليوم (بحد أقصى 3)
  lastAdResetDate: { type: String, default: "" },        // لتسجيل يوم آخر تصفير لعداد الإعلانات
  adsResetTime: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) }, // 👈 وقت تصفير الإعلانات (مهم للكنترولر)
  isRegistered: { type: Boolean, default: false },       // حالة التسجيل التلقائي في مسابقة الـ 3$ عند بلوغ 500 نقطة
  participantsCount: { type: Number, default: 0 },       // 👈 عداد المشاركين (مهم للكنترولر)

  adsLeft: { type: Number, default: 5 },                 // الحقول القديمة الخاصة بك
  lastPrize: { type: String, default: "0" },
  resetTime: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
  lastScratchAt: { type: Date, default: new Date(0) },

  // 📦 صندوق المفاجآت
  boxAvailable: { type: Boolean, default: true },        // أول مرة متاح مجانا
  boxNextOpen: { type: Date, default: new Date(0) },     // موعد الفتح القادم
  boxOpenedCount: { type: Number, default: 0 },          // عدد مرات الفتح

  // 🧩 خريطة مستويات لعبة المطابقة (Match-3)
  unlockedLevel: { type: Number, default: 1 },           // أعلى مستوى متاح للمستخدم
  levelCooldowns: { type: Map, of: Date, default: {} }
}, { timestamps: true });

// تصدير الموديل لكي نستخدمه في المسارات (Routes)
module.exports = mongoose.model("WheelUser", wheelSchema);