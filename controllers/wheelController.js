const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
const { generateReferralCode } = require("../utils/crypto");
const { getDbStatus } = require("../config/dbStatus");

// دالة اختيار الجائزة بناءً على الأوزان (الاحتمالات) لضمان عدم تفليس التطبيق
function getRandomIndexByWeight() {
    // الأوزان المقترحة: 0 (10%)، 5 (40%)، 10 (30%)، 20 (15%)، 50 (4%)، 100 (1%)
    const weights = [10, 40, 30, 15, 4, 1];
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
        // 🛡️ التعديل هنا: جلب الـ userId مباشرة من التوكن الموثوق
        const userId = req.user && req.user.uid;
        if (!userId) return res.status(400).send("❌ unauthorized userId");

        let account = await WheelUser.findOne({ userId });
        if (!account) {
            const finalCode = generateReferralCode(userId);
            account = await WheelUser.create({ 
                userId, 
                spinsLeft: 1, 
                referralCode: finalCode, 
                referredBy: "", 
                referralStatus: "none",
                resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
        }

        // التحقق من وقت إعادة التعيين اليومي
        if (new Date() >= account.resetTime) {
            account.adsLeft = 1;
            account.spinsLeft = 1; // إعادة تعيين المحاولات اليومية أيضاً
            account.resetTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await account.save();
        }
        res.json(account);
    } catch (err) {
        console.error(err);
        res.status(500).send("❌ خطأ في السيرفر");
    }
};

exports.spinWheel = async (req, res) => {
    if (!getDbStatus()) return res.status(503).send("⏳ DB not ready");
    try {
        // 🛡️ التعديل هنا: جلب الـ userId مباشرة من التوكن الموثوق
        const userId = req.user && req.user.uid;
        if (!userId) return res.status(400).send("❌ unauthorized userId");

        const account = await WheelUser.findOne({ userId });
        if (!account) return res.status(404).send("❌ غير موجود");
        if (account.spinsLeft <= 0) return res.status(400).send("⚠️ لا توجد محاولات");

        const prizes = ["0", "5", "10", "20", "50", "100"];
        const randomIndex = getRandomIndexByWeight(); // استخدام الأوزان الآمنة بدلاً من العشوائي البحت
        const reward = parseInt(prizes[randomIndex]);

        account.spinsLeft -= 1;
        account.points += reward;
        account.lastPrize = `${reward}`; // تخزين الرقم فقط ليتطابق مع واجهة الأندرويد لديك
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
            lastPrize: account.lastPrize 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("❌ خطأ في السيرفر");
    }
};

exports.watchAd = async (req, res) => {
    if (!getDbStatus()) return res.status(503).send("⏳ DB not ready");
    try {
        // 🛡️ التعديل هنا: جلب الـ userId مباشرة من التوكن الموثوق
        const userId = req.user && req.user.uid;
        if (!userId) return res.status(400).send("❌ unauthorized userId");

        const account = await WheelUser.findOne({ userId });
        if (!account) return res.status(404).send("❌ غير موجود");
        if (account.adsLeft <= 0) return res.status(400).send("⚠️ انتهت إعلانات اليوم");

        account.adsLeft -= 1;
        account.spinsLeft += 1;
        await account.save();
        res.json(account);
    } catch (err) {
        console.error(err);
        res.status(500).send("❌ خطأ في السيرفر");
    }
};