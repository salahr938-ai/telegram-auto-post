const admin = require("firebase-admin");

const verifyFirebaseToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // التحقق من أن الطلب يحتوي على هيدر التفويض ويبدأ بـ Bearer
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Access Denied: No token provided!" });
        }

        // استخراج التوكن من الـ Header
        const token = authHeader.split("Bearer ")[1];

        // التحقق من صلاحية التوكن عبر Firebase Admin SDK
        const decodedToken = await admin.auth().verifyIdToken(token);

        // تخزين معلومات المستخدم (مثل الـ uid) للرغبة في استخدامها لاحقاً
        req.user = decodedToken;

        next(); // المرور بنجاح إلى الـ Controller التنفيذي
    } catch (error) {
        console.error("Token verification failed:", error.message);
        return res.status(403).json({ error: "Unauthorized: Invalid or expired token!" });
    }
};

module.exports = verifyFirebaseToken;