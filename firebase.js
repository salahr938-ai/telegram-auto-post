// ===================
// 🔥 FIREBASE ADMIN CONFIG (ملف مستقل)
// ===================
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// استدعاء ملف المفتاح (بما أنه في نفس المجلد، نكتب ./ مجدداً)
const serviceAccount = require("./serviceAccountKey.json");

// تشغيل الاتصال بـ Firebase
initializeApp({
  credential: cert(serviceAccount)
});

const firestore = getFirestore();

// 📤 السطر السحري الناقص: تصدير المتغير لكي نقدر نخدمو بيه في ملفات أخرى
module.exports = firestore;