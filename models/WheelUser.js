const mongoose = require("mongoose");// // 1️⃣ استدعاء المانغوس (إجباري في كل موديل)
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
  resetTime: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
lastScratchAt: { type: Date, default: new Date(0) },
// 📦 صندوق المفاجآت
boxAvailable: { type: Boolean, default: true }, // أول مرة متاح مجانا
boxNextOpen: { type: Date, default: new Date(0) }, // موعد الفتح القادم
boxOpenedCount: { type: Number, default: 0 } // عدد مرات الفتح
}, { timestamps: true });

// تصدير الموديل لكي نستخدمه في المسارات (Routes)
module.exports = mongoose.model("WheelUser", wheelSchema);