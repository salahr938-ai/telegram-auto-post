const DailyCheckIn = require("../models/DailyCheckIn");
const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
const DAILY_REWARDS = [
  { dayNumber: 1, points: 1000 },
  { dayNumber: 2, points: 2000 },
  { dayNumber: 3, points: 3000 },
  { dayNumber: 4, points: 4000 },
  { dayNumber: 5, points: 5000 },
  { dayNumber: 6, points: 6000 },
  { dayNumber: 7, points: 10000 }
];

// ===================================
// 📅 1. مسار جلب حالة الأيام السبعة العمودية (GET) 🌟
// ===================================
exports.getStatus = async (req, res) => {

    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).send("❌ userId missing");

        // جلب أو إنشاء سجل التتابع للمخدم
        let progress = await DailyCheckIn.findOne({ userId });
        if (!progress) {
            progress = await DailyCheckIn.create({ userId, streakDays: 0, lastCheckInTime: null });
        }

        const now = Date.now();
        const expectedNextDay = progress.streakDays + 1; // اليوم الذي يجب تحصيله الآن

        // حساب مصفوفة الأيام الـ 7 لإرسالها للأندرويد
        const daysResponse = DAILY_REWARDS.map((reward) => {
            let isClaimed = reward.dayNumber <= progress.streakDays;
            let isLocked = reward.dayNumber > expectedNextDay;
            let availableAtTimestamp = 0;

            // إذا كان هذا هو اليوم المطلوب تحصيله، نتحقق من شرط الـ 24 ساعة
            if (reward.dayNumber === expectedNextDay && progress.lastCheckInTime) {
                const nextAvailableTime = new Date(progress.lastCheckInTime).getTime() + (24 * 60 * 60 * 1000);
                if (now < nextAvailableTime) {
                    availableAtTimestamp = nextAvailableTime; // نرسل الوقت المستقبلي للعداد التنازلي
                }
            }

            return {
                dayNumber: reward.dayNumber,
                points: reward.points,
                isClaimed: isClaimed,
                isLocked: isLocked,
                availableAtTimestamp: availableAtTimestamp
            };
        });

        res.json(daysResponse);

    } catch (err) {
        console.error("❌ GET DAILY STATUS ERROR:", err);
        res.status(500).send("❌ خطأ في السيرفر");
    }
};


// ===================================
// 💰 3. مسار المطالبة بالمكافأة وتحديث البيانات (POST)
// ===================================


exports.claimDaily = async (req, res) => {
  
    try {
        const { userId, dayNumber, rewardType = "normal" } = req.body;

        if (!userId || !dayNumber) {
            return res.status(400).send("❌ بيانات ناقصة");
        }

        let progress = await DailyCheckIn.findOne({ userId });
        if (!progress) {
            return res.status(404).send("❌ سجل المستخدم غير موجود");
        }

        const now = new Date();
        const expectedNextDay = progress.streakDays + 1;

        // التحقق من اليوم الصحيح
        if (parseInt(dayNumber) !== expectedNextDay) {
            return res.status(400).send("❌ هذا اليوم غير متاح حالياً");
        }

        // التحقق من مرور 24 ساعة
        if (progress.lastCheckInTime) {
            const nextAvailableTime = new Date(progress.lastCheckInTime).getTime() + (24 * 60 * 60 * 1000);
            if (Date.now() < nextAvailableTime) {
                return res.status(400).send("⚠️ لم تمر 24 ساعة بعد");
            }
        }

        const rewardConfig = DAILY_REWARDS.find(r => r.dayNumber === expectedNextDay);
        if (!rewardConfig) {
            return res.status(400).send("❌ إعداد الجائزة غير موجود");
        }

        let rewardPoints = rewardConfig.points;

        // مضاعفة المكافأة عند مشاهدة الإعلان
        if (rewardType === "double") {
            rewardPoints *= 2;
        }

        // تحديث التتابع: إذا وصل لليوم السابع يصفر التتابع ليبدأ أسبوعاً جديداً
        progress.streakDays = expectedNextDay >= 7 ? 0 : expectedNextDay;
        progress.lastCheckInTime = now;
        await progress.save();

        // تحديث النقاط في حساب المستخدم الأساسي
        const account = await WheelUser.findOne({ userId });
        if (!account) {
            return res.status(404).send("❌ حساب النقاط غير موجود");
        }

        account.points += rewardPoints;
        await account.save();


//هيستوري مسار 

await PointsHistory.create({
  userId: userId,
  amount: rewardPoints,
  source: rewardType === "double" ? "daily_double" : "daily_normal",
  description: rewardType === "double" ? `مكافأة اليوم ${dayNumber} مضاعفة ✖️2️⃣` : `مكافأة الدخول اليومي لليوم ${dayNumber} 📅`
});



        console.log(`🎁 Daily reward: +${rewardPoints} points for ${userId}`);

        res.json({
            success: true,
            rewardType,
            reward: rewardPoints,
            newPoints: account.points
        });

    } catch (err) {
        console.error("❌ DAILY CLAIM ERROR:", err);
        res.status(500).send("❌ خطأ داخلي في السيرفر");
    }
};



//مسار جلب الهيستوري 

exports.getPointsHistory = async (req, res) => {
   
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).send("❌ userId missing");

        // جلب آخر 50 عملية مرتبة من الأحدث إلى الأقدم
        const history = await PointsHistory.find({ userId }).sort({ createdAt: -1 }).limit(50);
        res.json(history);
    } catch (err) {
        console.error("❌ GET HISTORY ERROR:", err);
        res.status(500).send("❌ خطأ في السيرفر");
    }
};

