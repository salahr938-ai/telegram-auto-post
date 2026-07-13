const WheelUser = require("../models/WheelUser");

// توزيع الجوائز
const prizes = [
    { chance: 35, points: 20 },
    { chance: 25, points: 30 },
    { chance: 15, points: 50 },
    { chance: 10, points: 80 },
    { chance: 8, points: 100 },
    { chance: 5, points: 150 },
    { chance: 1.8, points: 300 },
    { chance: 0.2, points: 1000 }
];

// اختيار جائزة عشوائية
function getRandomPrize() {
    const random = Math.random() * 100;
    let total = 0;

    for (const prize of prizes) {
        total += prize.chance;
        if (random <= total) {
            return prize.points;
        }
    }

    return 20;
}

// معرفة حالة الصندوق
exports.getStatus = async (req, res) => {
    try {
        const { userId } = req.body;

        const user = await WheelUser.findOne({ userId });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "المستخدم غير موجود"
            });
        }

        const now = new Date();

        // إذا انتهى العداد يصبح الصندوق متاحاً تلقائياً
        if (!user.boxAvailable && user.boxNextOpen && now >= user.boxNextOpen) {
            user.boxAvailable = true;
            await user.save();
        }

        if (user.boxAvailable) {
            return res.json({
                success: true,
                canOpen: true,
                remainingTime: 0 // الصندوق جاهز، لا يوجد وقت متبقي
            });
        }

        // حساب الوقت المتبقي وتحويله من (ملي ثانية) إلى (ثواني) ليتوافق مع الأندرويد
        const remainingMillis = user.boxNextOpen ? (user.boxNextOpen.getTime() - now.getTime()) : 0;
        const remainingSeconds = Math.max(0, Math.floor(remainingMillis / 1000));

        res.json({
            success: true,
            canOpen: remainingSeconds <= 0,
            remainingTime: remainingSeconds
        });

    } catch (e) {
        res.status(500).json({
            success: false,
            message: e.message
        });
    }
};

// فتح الصندوق
exports.openBox = async (req, res) => {
    try {
        const { userId } = req.body;

        const user = await WheelUser.findOne({ userId });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "المستخدم غير موجود"
            });
        }

        const now = new Date();

        // التحقق من إتاحة الصندوق
        if (!user.boxAvailable && user.boxNextOpen && now < user.boxNextOpen) {
            return res.json({
                success: false,
                message: "الصندوق غير متاح حاليا"
            });
        }

        const prize = getRandomPrize();

        user.points += prize;
        user.boxOpenedCount = (user.boxOpenedCount || 0) + 1;

        // بعد الفتح مباشرة، يصبح غير متاح حتى يشاهد الإعلان بالكامل لتفعيل العداد
        user.boxAvailable = false;

        await user.save();

        res.json({
            success: true,
            prize,
            points: user.points
        });

    } catch (e) {
        res.status(500).json({
            success: false,
            message: e.message
        });
    }
};

// بعد مشاهدة الإعلان
exports.watchAd = async (req, res) => {
    try {
        const { userId } = req.body;

        const user = await WheelUser.findOne({ userId });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "المستخدم غير موجود"
            });
        }

        // تأكيد إغلاق الصندوق وبدء العداد التنازلي لـ 3 ساعات
        user.boxAvailable = false;
        user.boxNextOpen = new Date(Date.now() + 3 * 60 * 60 * 1000);

        await user.save();

        res.json({
            success: true,
            nextOpen: user.boxNextOpen
        });

    } catch (e) {
        res.status(500).json({
            success: false,
            message: e.message
        });
    }
};