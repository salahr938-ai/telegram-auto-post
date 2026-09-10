// ===================
// 🔥 FIREBASE ADMIN CONFIG
// ===================

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth"); // أضف هذا السطر لاستيراد الـ Auth

// التحقق مما إذا كان التطبيق مفعل مسبقاً لمنع التكرار
if (!getApps().length) {
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is missing!");
    }

    initializeApp({
        credential: cert(serviceAccount)
    });
}

// إنشاء اتصال Firestore و Auth
const firestore = getFirestore();
const auth = getAuth(); // تهيئة الـ Auth

// تصديرهما معا لاستخدامهما في باقي الملفات
module.exports = {
    firestore,
    auth
};