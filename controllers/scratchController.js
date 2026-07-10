const WheelUser = require('../models/wheelUser'); // تأكد من اسم الملف
const PointsHistory = require('../models/pointsHistory'); // استوردنا الاسم الصحيح

exports.claimScratch = async (req, res) => {
    try {
        const { userId, amount } = req.body;

        // 1. تحديث النقاط في موديل WheelUser
        const user = await WheelUser.findOneAndUpdate(
            { userId: userId },
            { $inc: { points: amount } },
            { new: true }
        );

        if (!user) return res.status(404).json({ message: "مستخدم غير موجود" });

        // 2. تسجيل العملية في سجل التاريخ (ليظهر في التطبيق)
        await PointsHistory.create({
            userId: userId,
            amount: amount,
            source: 'scratch',
            description: 'جائزة بطاقة الكشط اليومية',
            createdAt: new Date()
        });

        res.status(200).json({ success: true, points: user.points });
    } catch (error) {
        res.status(500).json({ message: "خطأ في السيرفر", error: error.message });
    }
};