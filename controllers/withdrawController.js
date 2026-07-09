const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
const { firestore } = require("../firebase");
const { isDbConnected } = require("../index"); // تأكد من استيراد حالة الاتصال

exports.withdraw = async (req, res) => {
    if (!isDbConnected) return res.status(503).send("⏳ قاعدة البيانات غير جاهزة");

    try {
        const { userId, points, wallet } = req.body;
        if (!userId || !points || !wallet) return res.status(400).send("❌ بيانات الطلب ناقصة");

        const requestedPoints = parseInt(points);
        if (isNaN(requestedPoints) || requestedPoints <= 0) return res.status(400).send("❌ كمية غير صالحة");

        const account = await WheelUser.findOne({ userId });
        if (!account) return res.status(404).send("❌ الحساب غير موجود");
        if (account.points < requestedPoints) return res.status(400).send("❌ رصيد غير كافٍ");

        account.points -= requestedPoints;
        await account.save();

        // تسجيل في الهيستوري
        await PointsHistory.create({
            userId,
            amount: -requestedPoints,
            source: 'withdraw',
            description: `سحب نقاط لمحفظة: ${wallet}`
        });

        try {
            await firestore.collection("redeem_requests").add({
                userId, points: requestedPoints, wallet, status: "pending", createdAt: new Date()
            });
        } catch (fbErr) {
            console.log("⚠️ تعذر التسجيل بالفايربيس:", fbErr.message);
        }

        res.json({ success: true, newPoints: account.points, message: "تم الخصم وتسجيل الطلب بنجاح" });
    } catch (err) {
        console.error("❌ WITHDRAW ERROR:", err);
        res.status(500).send("❌ خطأ داخلي");
    }
};

exports.reject = async (req, res) => {
    if (!isDbConnected) return res.status(503).send("⏳ قاعدة البيانات غير جاهزة");

    try {
        const { requestId, userId, points } = req.body;
        const pointsToReturn = parseInt(points);

        const account = await WheelUser.findOne({ userId });
        if (account) {
            account.points += pointsToReturn;
            await account.save();
        }

        await firestore.collection("redeem_requests").doc(requestId).update({ status: "rejected" });
        res.json({ success: true, message: "تم الرفض وإرجاع النقاط" });
    } catch (err) {
        console.error("❌ REJECT ERROR:", err);
        res.status(500).send("❌ خطأ داخلي");
    }
};