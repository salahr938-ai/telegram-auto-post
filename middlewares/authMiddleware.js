// استيراد الـ auth مباشرة من ملف الإعدادات الخاص بك (تأكد من صحة مسار الملف)
const { auth } = require("../config/firebaseConfig"); 

const verifyFirebaseToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // التحقق من أن الطلب يحتوي على هيدر التفويض ويبدأ بـ Bearer
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Access Denied: No token provided!" });
        }

        // استخراج التوكن من الـ Header
        const token = authHeader.split("Bearer ")[1];

        // التحقق من صلاحية التوكن مباشرة باستخدام الـ auth المستورد
        const decodedToken = await auth.verifyIdToken(token);

        // تخزين معلومات المستخدم (مثل الـ uid) لاستخدامها لاحقاً
        req.user = decodedToken;

        next(); // المرور بنجاح إلى الـ Controller التنفيذي
    } catch (error) {
        console.error("Token verification failed:", error.message);
        return res.status(403).json({ error: "Unauthorized: Invalid or expired token!" });
    }
};

module.exports = verifyFirebaseToken;