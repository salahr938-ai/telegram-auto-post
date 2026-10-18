const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
const mongoose = require("mongoose");
// توزيع الجوائز ونسب الحظ
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

// 1. معرفة حالة الصندوق (تم التعديل لإرسال النقاط الكلية)
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
        const totalPoints = user.points || 0; // 🌟 جلب النقاط الكلية للمستخدم

        // إذا لم يبدأ العداد بعد (ينتظر مشاهدة الإعلان)
        if (
            !user.boxAvailable &&
            user.boxNextOpen &&
            user.boxNextOpen.getTime() === 0
        ) {
            return res.json({
                success: true,
                canOpen: false,
                remainingTime: 0,
                points: totalPoints // 🌟 أضفنا النقاط هنا
            });
        }

        // إذا انتهت مدة الثلاث ساعات
        if (
            !user.boxAvailable &&
            user.boxNextOpen &&
            user.boxNextOpen.getTime() > 0 &&
            now >= user.boxNextOpen
        ) {
            user.boxAvailable = true;
            await user.save();

            return res.json({
                success: true,
                canOpen: true,
                remainingTime: 0,
                points: totalPoints // 🌟 أضفنا النقاط هنا
            });
        }

        if (user.boxAvailable) {
            return res.json({
                success: true,
                canOpen: true,
                remainingTime: 0,
                points: totalPoints // 🌟 أضفنا النقاط هنا
            });
        }

        const remainingMillis = user.boxNextOpen
            ? user.boxNextOpen.getTime() - now.getTime()
            : 0;

        res.json({
            success: true,
            canOpen: false,
            remainingTime: Math.max(
                0,
                Math.floor(remainingMillis / 1000)
            ),
            points: totalPoints // 🌟 أضفنا النقاط هنا أيضاً
        });

    } catch (e) {
        res.status(500).json({
            success: false,
            message: e.message
        });
    }
};

// 2. فتح الصندوق الفعلي وتوزيع الجوائز

exports.openBox = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const { userId } = req.body;

        // قفل الصندوق بشكل Atomic لمنع الفتح مرتين
        const user = await WheelUser.findOneAndUpdate(
            {
                userId,
                boxAvailable: true
            },
            {
                $set: {
                    boxAvailable: false,
                    boxNextOpen: new Date(Date.now() + 3 * 60 * 60 * 1000) // 👈 يبدأ عداد الـ 3 ساعات فور فتح الصندوق
                }
            },
            {
                new: true,
                session
            }
        );

        if (!user) {
            throw new Error("الصندوق غير متاح أو يجب مشاهدة الإعلان أولاً.");
        }

        // اختيار الجائزة
        const prize = getRandomPrize();

        // إضافة النقاط بأمان
        user.points = (user.points || 0) + prize;
        user.boxOpenedCount = (user.boxOpenedCount || 0) + 1;

        await user.save({ session });

        // تسجيل العملية
        await PointsHistory.create(
            [
                {
                    userId,
                    amount: prize,
                    source: "surprise_box",
                    description: `ربحت ${prize} نقطة من فتح صندوق المفاجآت!`
                }
            ],
            { session }
        );

        // حفظ جميع العمليات
        await session.commitTransaction();

        res.json({
            success: true,
            prize,
            points: user.points
        });

    } catch (e) {
        await session.abortTransaction();

        res.status(400).json({
            success: false,
            message: e.message
        });

    } finally {
        session.endSession();
    }
};

// 3. مشاهدة الإعلان وتفعيل عداد الـ 3 ساعات
// 3. مشاهدة الإعلان وتفعيل عداد الـ 3 ساعات (مع حد أقصى 3 إعلانات يومياً + فاصل زمني 5 دقائق)
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

        const now = new Date();

        // 🛡️ 1. التحقق من إعادة تعيين عداد الإعلانات اليومي (إذا مر يوم جديد)
        const lastWatch = user.boxAdsLastWatchedDate ? new Date(user.boxAdsLastWatchedDate) : null;
        const isNewDay = !lastWatch || 
            now.getDate() !== lastWatch.getDate() || 
            now.getMonth() !== lastWatch.getMonth() || 
            now.getFullYear() !== lastWatch.getFullYear();

        if (isNewDay) {
            user.boxAdsWatchedToday = 0;
            user.boxAdsLastWatchedDate = null; // إعادة تعيين وقت آخر إعلان لليوم الجديد
        }

        // 🛡️ 2. التحقق من تجاوز الحد الأقصى (3 إعلانات يومياً)
        if (user.boxAdsWatchedToday >= 3) {
            return res.status(400).json({
                success: false,
                message: "لقد استنفدت الحد الأقصى لمشاهدة إعلانات الصندوق اليومية (3 إعلانات)."
            });
        }

        // 🛡️ 3. التحقق من الفاصل الزمني بين الإعلانات (5 دقائق)
        if (user.boxAdsLastWatchedAt) {
            const timeSinceLastAd = now.getTime() - new Date(user.boxAdsLastWatchedAt).getTime();
            const cooldownTime = 5 * 60 * 1000; // 5 دقائق بالمللي ثانية

            if (timeSinceLastAd < cooldownTime) {
                const remainingMinutes = Math.ceil((cooldownTime - timeSinceLastAd) / (60 * 1000));
                return res.status(400).json({
                    success: false,
                    message: `يرجى الانتظار ${remainingMinutes} دقائق قبل مشاهدة إعلان آخر.`
                });
            }
        }

        // 📝 تحديث البيانات بعد مشاهدة الإعلان بنجاح
        user.boxAdsWatchedToday = (user.boxAdsWatchedToday || 0) + 1;
        user.boxAdsLastWatchedAt = now;
        user.boxAdsLastWatchedDate = now;

        // 🎁 تفعيل الصندوق وبدء مؤقت الـ 3 ساعات الجديدة لتخطي الانتظار
        user.boxAvailable = true; 
        user.boxNextOpen = new Date(now.getTime() + 3 * 60 * 60 * 1000); 

        await user.save();

        res.json({
            success: true,
            message: "تم تخطي الانتظار وتفعيل الصندوق بنجاح!",
            boxAdsWatchedToday: user.boxAdsWatchedToday,
            remainingAds: 3 - user.boxAdsWatchedToday,
            nextOpen: user.boxNextOpen
        });

    } catch (e) {
        res.status(500).json({
            success: false,
            message: e.message
        });
    }
};