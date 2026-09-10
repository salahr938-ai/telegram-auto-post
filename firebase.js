// ===================
// 🔥 FIREBASE ADMIN CONFIG
// ===================

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

// التحقق مما إذا كان التطبيق مفعل مسبقاً لمنع التكرار
if (!getApps().length) {
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            // قراءة المفتاح وتتبع أي خطأ بدقة مع فحص الـ JSON
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } catch (e) {
            console.error("❌ خطأ قاتل في صيغة JSON الخاصة بـ FIREBASE_SERVICE_ACCOUNT:", e.message);
            throw e;
        }
    } else {
        throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is missing!");
    }

    initializeApp({
        credential: cert(serviceAccount)
    });
}

// إنشاء اتصال Firestore و Auth
const firestore = getFirestore();
const auth = getAuth();

// تصديرهما معا لاستخدامهما في باقي الملفات
module.exports = {
    firestore,
    auth
};