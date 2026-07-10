// غيّر السطر الأول ليكون:
const WheelUser = require('../models/WheelUser'); 

// غيّر السطر الثاني ليكون:
const PointsHistory = require('../models/PointsHistory');

exports.claimScratch = async (req, res) => {
    try {
        const { userId, amount } = req.body;

        // 1. ابحث عن المستخدم أولاً دون تعديل أي شيء
        const user = await WheelUser.findOne({ userId: userId });
        if (!user) return res.status(404).json({ message: "مستخدم غير موجود" });

        // 2. تحقق من الوقت الآن
        const now = new Date();
        const lastScratch = user.lastScratchAt || new Date(0); 
        const diffInHours = (now - lastScratch) / (1000 * 60 * 60);

        if (diffInHours < 24) {
            return res.status(403).json({ 
                message: "عذراً، يجب انتظار 24 ساعة للعملية القادمة",
                remainingHours: (24 - diffInHours).toFixed(1) 
            });
        }

        // 3. إذا مر الوقت، نقوم بتحديث النقاط وتحديث وقت الكشط
        user.points += amount;
        user.lastScratchAt = now; 
        await user.save();

        // 4. تسجيل التاريخ
        await PointsHistory.create({
            userId: userId,
            amount: amount,
            source: 'scratch',
            description: 'جائزة بطاقة الكشط اليومية',
            createdAt: now
        });

        res.status(200).json({ success: true, points: user.points });
    } catch (error) {
        res.status(500).json({ message: "خطأ في السيرفر", error: error.message });
    }
};