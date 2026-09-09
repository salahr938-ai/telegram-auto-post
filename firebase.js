// ===================
// 🔥 FIREBASE ADMIN CONFIG
// ===================

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// التحقق مما إذا كان التطبيق مفعل مسبقاً لمنع التكرار
if (!getApps().length) {
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // قراءة المفتاح من المتغير البيئي الآمن (على Render أو .env محلياً)
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is missing!");
    }

    initializeApp({
        credential: cert(serviceAccount)
    });
}

// إنشاء اتصال Firestore
const firestore = getFirestore();

// تصدير Firestore لاستخدامه في Controllers
module.exports = firestore;