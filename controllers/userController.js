const WheelUser = require("../models/WheelUser");
const DailyCheckIn = require("../models/DailyCheckIn");
// تأكد من استيراد دالة التوليد من المكان الذي توجد فيه (مثلاً ملف utils)
const { generateReferralCode } = require("../utils/generator"); 
const { getDbStatus } = require("../config/dbStatus");
exports.initUser = async (req, res) => {
    // نستخدم المتغير العام isDbConnected من الـ index
 if (!getDbStatus()) {
    return res.status(503).send("⏳ DB not ready");
}

    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).send("❌ userId required");

        // 1. تهيئة بيانات النقاط
        let account = await WheelUser.findOne({ userId });
        if (!account) {
            console.log(`🆕 تهيئة حساب نقاط جديد للمستخدم: ${userId}`);
            const finalCode = generateReferralCode(userId);
            account = await WheelUser.create({
                userId,
                spinsLeft: 3,
                referralCode: finalCode,
                referredBy: "",
                referralStatus: "none"
            });
        }

        // 2. تهيئة بيانات الدخول اليومي
        let progress = await DailyCheckIn.findOne({ userId });
        if (!progress) {
            console.log(`🆕 تهيئة سجل دخول يومي جديد للمستخدم: ${userId}`);
            await DailyCheckIn.create({
                userId,
                streakDays: 0,
                lastCheckInTime: null
            });
        }

        res.json({ success: true, message: "تمت تهيئة الحساب بنجاح وعمل المزامنة المونجو" });

    } catch (err) {
        console.error("❌ INIT USER ERROR:", err);
        res.status(500).send("❌ خطأ داخلي في السيرفر");
    }
};