const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
const { generateReferralCode } = require("../utils/crypto");
const { isDbConnected } = require("../index"); // أو مسار DB

exports.getWheelStatus = async (req, res) => {
    if (!isDbConnected) return res.status(503).send("⏳ DB not ready");
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).send("❌ userId required");

        let account = await WheelUser.findOne({ userId });
        if (!account) {
            const finalCode = generateReferralCode(userId);
            account = await WheelUser.create({ 
                userId, spinsLeft: 3, referralCode: finalCode, referredBy: "", referralStatus: "none" 
            });
        }
        if (new Date() >= account.resetTime) {
            account.adsLeft = 5;
            account.resetTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await account.save();
        }
        res.json(account);
    } catch (err) {
        res.status(500).send("❌ خطأ");
    }
};

exports.spinWheel = async (req, res) => {
    if (!isDbConnected) return res.status(503).send("⏳ DB not ready");
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).send("❌ userId required");
        const account = await WheelUser.findOne({ userId });
        if (!account) return res.status(404).send("❌ غير موجود");
        if (account.spinsLeft <= 0) return res.status(400).send("⚠️ لا توجد محاولات");

        const prizes = ["0", "5", "10", "20", "50", "100"];
        const randomIndex = Math.floor(Math.random() * prizes.length);
        const reward = parseInt(prizes[randomIndex]);

        account.spinsLeft -= 1;
        account.points += reward;
        account.lastPrize = `${reward} Points`;
        await account.save();

        if (reward > 0) {
            await PointsHistory.create({
                userId, amount: reward, source: 'wheel', description: 'الفوز في عجلة الحظ 🎡'
            });
        }
        res.json({ index: randomIndex, newPoints: account.points, spinsLeft: account.spinsLeft, lastPrize: account.lastPrize });
    } catch (err) {
        res.status(500).send("❌ خطأ");
    }
};

exports.watchAd = async (req, res) => {
    if (!isDbConnected) return res.status(503).send("⏳ DB not ready");
    try {
        const { userId } = req.body;
        const account = await WheelUser.findOne({ userId });
        if (!account) return res.status(404).send("❌ غير موجود");
        if (account.adsLeft <= 0) return res.status(400).send("⚠️ انتهت إعلانات اليوم");

        account.adsLeft -= 1;
        account.spinsLeft += 1;
        await account.save();
        res.json(account);
    } catch (err) {
        res.status(500).send("❌ خطأ");
    }
};