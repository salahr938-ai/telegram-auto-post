const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
const mongoose = require("mongoose");

// تحديث نقاط لعبة المطابقة عند الفوز بالمستوى
exports.updateScore = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const { userId, pointsEarned } = req.body;

        if (!userId || !pointsEarned || pointsEarned <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: "بيانات غير صالحة أو النقاط غير مسجلة" 
            });
        }

        // البحث عن المستخدم باستخدام الموديل الموحد WheelUser
        const user = await WheelUser.findOne({ userId }).session(session);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: "المستخدم غير موجود" 
            });
        }

        // إضافة النقاط الجديدة إلى الرصيد الكلي
        user.points = (user.points || 0) + Number(pointsEarned);
        await user.save({ session });

        // تسجيل العملية في السجل
        await PointsHistory.create([{
            userId,
            amount: pointsEarned,
            source: "match3_game",
            description: `ربحت ${pointsEarned} نقطة من إتمام مستوى في لعبة المطابقة!`
        }], { session });

        await session.commitTransaction();

        res.json({
            success: true,
            totalPoints: user.points,
            message: "تم حفظ النقاط بنجاح"
        });

    } catch (e) {
        await session.abortTransaction();
        res.status(500).json({ 
            success: false, 
            message: e.message 
        });
    } finally {
        session.endSession();
    }
};