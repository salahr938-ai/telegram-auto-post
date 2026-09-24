const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
const { generateReferralCode } = require("../utils/crypto");
const { getDbStatus } = require("../config/dbStatus");

// دالة اختيار الجائزة بناءً على الأوزان (الاحتمالات) لضمان عدم تفليس التطبيق
function getRandomIndexByWeight() {
    const weights = [10, 20, 30, 25, 10, 5]; // أوزان الجائزة (مثلاً من 10 إلى 60 نقطة)
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let randomNum = Math.random() * totalWeight;
    
    for (let i = 0; i < weights.length; i++) {
        if (randomNum < weights[i]) return i;
        randomNum -= weights[i];
    }
    return 0;
}

exports.getWheelStatus = async (req, res) => {
    if (!getDbStatus()) return res.status(503).send("⏳ DB not ready");
    try {
        const userId = req.user && req.user.uid;
        if (!userId) return res.status(400).send("❌ unauthorized userId");

        let account = await WheelUser.findOne({ userId });
        const now = new Date();

        if (!account) {
            const finalCode = generateReferralCode(userId);
            account = await WheelUser.create({ 
                userId, 
                points: 0,
                spinsLeft: 1, 
                referralCode: finalCode, 
                referredBy: "", 
                referralStatus: "none",
                friendPoints: 0.0, // 👈 تهيئة رصيد الأصدقاء الجديد
                nextSpinTime: now, 
                adsWatchedToday: 0,
                adsResetTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
                isRegistered: false,
                participantsCount: 0
            });
        }

        // 1. التحقق من إعادة تعيين إعلانات اليوم (كل 24 ساعة)
        if (now >= account.adsResetTime) {
            account.adsWatchedToday = 0;
            account.adsResetTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            await account.save();
        }

        // 2. التحقق من مؤقت اللفة المجانية (كل 3 ساعات)
        if (account.spinsLeft <= 0 && now >= account.nextSpinTime) {
            account.spinsLeft = 1;
            await account.save();
        }

        res.json({
            points: account.points,
            spinsLeft: account.spinsLeft,
            lastPrize: account.lastPrize || "0",
            participantsCount: account.participantsCount || 0,
            maxParticipants: 500,
            isRegistered: account.isRegistered || false,
            adsWatchedToday: account.adsWatchedToday || 0,
            nextSpinTime: account.nextSpinTime || now,
            friendPoints: account.friendPoints || 0.0, // 👈 إرسال رصيد الأصدقاء للتطبيق
            referralCode: account.referralCode,
            referredBy: account.referredBy,
            referralStatus: account.referralStatus
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("❌ خطأ في السيرفر");
    }
};

exports.spinWheel = async (req, res) => {
    if (!getDbStatus()) return res.status(503).send("⏳ DB not ready");
    try {
        const userId = req.user && req.user.uid;
        if (!userId) return res.status(400).send("❌ unauthorized userId");

        const { isAdReward } = req.body; 
        const account = await WheelUser.findOne({ userId });
        if (!account) return res.status(404).send("❌ غير موجود");

        const now = new Date();

        if (isAdReward) {
            if (account.adsWatchedToday >= 3) {
                return res.status(400).send("⚠️ لقد استنفذت الحد الأقصى لإعلانات اليوم (3/3)");
            }
            account.adsWatchedToday += 1;
        } else {
            if (account.spinsLeft <= 0 && now < account.nextSpinTime) {
                return res.status(400).send("⚠️ يجدر بك الانتظار حتى ينتهي مؤقت الـ 3 ساعات");
            }
            if (account.spinsLeft > 0) {
                account.spinsLeft -= 1;
            }
            account.nextSpinTime = new Date(now.getTime() + 3 * 60 * 60 * 1000); 
        }

        const prizes = ["10", "20", "30", "40", "50", "60"];
        const randomIndex = getRandomIndexByWeight();
        const reward = parseInt(prizes[randomIndex]);

        account.points += reward;
        account.lastPrize = `${reward}`;

        // التحقق من وصول المستخدم إلى 500 نقطة لتسجيله في المسابقة
        if (account.points >= 500 && !account.isRegistered) {
            account.isRegistered = true;
            account.participantsCount = (account.participantsCount || 0) + 1;
            // ملاحظة: تم إزالة المنح التلقائي هنا، وسيتم اعتماد مكافأة الـ 0.20 يدوياً 
            // عبر دالة confirmReferral عندما يفوز الصديق ضمن الـ 3 فائزين.
        }

        await account.save();

        if (reward > 0) {
            await PointsHistory.create({
                userId, amount: reward, source: 'wheel', description: 'الفوز في عجلة الحظ 🎡'
            });
        }

        res.json({ 
            index: randomIndex, 
            newPoints: account.points, 
            spinsLeft: account.spinsLeft, 
            lastPrize: account.lastPrize,
            adsWatchedToday: account.adsWatchedToday,
            nextSpinTime: account.nextSpinTime,
            isRegistered: account.isRegistered,
            participantsCount: account.participantsCount
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("❌ خطأ في السيرفر");
    }
};