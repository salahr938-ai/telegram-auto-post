const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

if (!getApps().length) {
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            // محاولة قراءة ملف الـ JSON كاملاً إذا كان موجوداً
            let rawKey = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
            serviceAccount = JSON.parse(rawKey);
        } catch (e) {
            console.error("⚠️ فشل قراءة JSON مباشر، جاري التحقق من المتغيرات البديلة...");
        }
    }

    // إذا فشل الـ JSON أو لم يكن موجوداً، نقرأ بالطريقة البديلة الآمنة
    if (!serviceAccount || !serviceAccount.private_key) {
        serviceAccount = {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
        };
    }

    initializeApp({
        credential: cert(serviceAccount)
    });
}

const firestore = getFirestore();
const auth = getAuth();

module.exports = {
    firestore,
    auth
};