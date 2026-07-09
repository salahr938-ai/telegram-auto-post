// ===================
// 🔥 FIREBASE ADMIN CONFIG
// ===================

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// تحميل مفتاح Firebase Admin
const serviceAccount = require("./serviceAccountKey.json");

// تشغيل Firebase Admin
initializeApp({
    credential: cert(serviceAccount)
});

// إنشاء اتصال Firestore
const firestore = getFirestore();

// تصدير Firestore لاستخدامه في Controllers
module.exports = firestore;