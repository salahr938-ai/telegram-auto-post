const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
const mongoose = require("mongoose");

// ================= الإعدادات =================
// أقصى نقاط ممكنة في جولة واحدة (9 مربعات آمنة × 50 كحد أقصى نظري)
const MAX_BOMB_POINTS_PER_ROUND = 450;

exports.claimPoints = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // الهوية دائماً من التوكن الموثّق
        const userId = req.user?.uid;
        if (!userId) {
            await session.abortTransaction();
            return res.status(401).json({
                success: false,
                message: "unauthorized"
            });
        }

        const pointsEarned = Number(req.body?.pointsEarned);
        const reason = req.body?.reason === "CLEARED" ? "CLEARED" : "CASHOUT";

        if (!Number.isFinite(pointsEarned) || pointsEarned <= 0 || !Number.isInteger(pointsEarned)) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "قيمة النقاط غير صالحة"
            });
        }

        if (pointsEarned > MAX_BOMB_POINTS_PER_ROUND) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "قيمة النقاط تجاوزت الحد المسموح للجولة"
            });
        }

        const user = await WheelUser.findOne({ userId }).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: "المستخدم غير موجود"
            });
        }

        user.points = (user.points || 0) + pointsEarned;
        await user.save({ session });

        await PointsHistory.create([{
            userId,
            amount: pointsEarned,
            source: "bomb_game",
            description: reason === "CLEARED"
                ? `ربحت ${pointsEarned} نقطة بعد كشف كل المربعات الآمنة في لعبة القنابل!`
                : `انسحبت وربحت ${pointsEarned} نقطة من لعبة القنابل!`
        }], { session });

        await session.commitTransaction();

        return res.json({
            success: true,
            totalPoints: user.points,
            addedPoints: pointsEarned,
            message: "تم حفظ النقاط بنجاح"
        });
    } catch (e) {
        await session.abortTransaction();
        console.error("bomb claimPoints error:", e);
        return res.status(500).json({
            success: false,
            message: e.message || "خطأ في السيرفر"
        });
    } finally {
        session.endSession();
    }
};