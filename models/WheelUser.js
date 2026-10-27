const mongoose = require("mongoose"); // 1️⃣ استدعاء المانغوس (إجباري في كل موديل)

// كود خاص بالنقاط والمسابقات
const wheelSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  referralCode: { type: String, unique: true },          // الكود الخاص بالمستخدم
  referredBy: { type: String, default: "" },             // الشخص لي دعاه
  points: { type: Number, default: 0 },
  referralStatus: { type: String, default: "none" },     // الحالة الافتراضية الصحيحة "none"
  // 🛡️ حقل التوثيق الجديد الخاص بتطبيق راجي
  isVerified: { 
    type: Boolean, 
    default: false // يبدأ غير موثق تلقائياً عند التسجيل
  },
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
boxAvailable: { type: Boolean, default: true },        // أول مرة متاح مجانا
  boxNextOpen: { type: Date, default: new Date(0) },     // موعد الفتح القادم
  boxOpenedCount: { type: Number, default: 0 },          // عدد مرات الفتح
  
  // 🛡️ الحقول الجديدة الخاصة بحماية إعلانات الصندوق (الحد اليومي + الكولداون)
  boxAdsWatchedToday: { type: Number, default: 0 },      // عدد الإعلانات المشاهدة اليوم
  boxAdsLastWatchedDate: { type: Date, default: null },  // تاريخ آخر إعلان لمراقبة التصفير اليومي
  boxAdsLastWatchedAt: { type: Date, default: null },
  // 🧩 خريطة مستويات لعبة المطابقة (Match-3)
  unlockedLevel: { type: Number, default: 1 },           // أعلى مستوى متاح للمستخدم
  levelCooldowns: { type: Map, of: Date, default: {} },

  // 🤲 حقول ميزة الأدعية والسنن الجديدة
  totalDuasPublished: { type: Number, default: 0 },
  totalLikesReceived: { type: Number, default: 0 },
  lastPostDate: { type: Date, default: null },
  likesGivenThisHour: { type: Number, default: 0 },
  lastLikeResetTime: { type: Date, default: Date.now },
    // 🎁 إعجابات إضافية من الإعلانات
  bonusLikes: { type: Number, default: 0 },
  bonusAdsToday: { type: Number, default: 0 },
  bonusAdsDate: { type: String, default: "" },
    bonusAdLastAt: { type: Date, default: null },

  // 🛡️ حقول حماية إعلانات العجلة المؤقتة
  pendingAdToken: { type: String, default: null },
  adTokenExpiresAt: { type: Date, default: null },
  adVerified: { type: Boolean, default: false },
registeredContest: { type: Number, default: 0 },
 lastAdAt: { type: Date, default: null },   // 👈 السطر الجديد
friendPoints: { type: Number, default: 0 },
}, { timestamps: true });




// تصدير الموديل لكي نستخدمه في المسارات (Routes)
module.exports = mongoose.model("WheelUser", wheelSchema);