const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
const mongoose = require("mongoose");

// تحديث نقاط ومستوى لعبة Water Sort عند الفوز مع حماية 24 ساعة ضد الغش
exports.updateScore = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const { userId, pointsEarned, levelCompleted } = req.body;

        if (!userId || !pointsEarned || pointsEarned <= 0 || !levelCompleted) {
            return res.status(400).json({ 
                success: false, 
                message: "بيانات غير صالحة أو المستوى غير مسجل" 
            });
        }

        const user = await WheelUser.findOne({ userId }).session(session);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: "المستخدم غير موجود" 
            });
        }

        // استخدام حقل خاص بـ Water Sort لتفادي التداخل مع الألعاب الأخرى
        if (!user.waterSortCooldowns) {
            user.waterSortCooldowns = new Map();
        }

        const lastWinTime = user.waterSortCooldowns.get(levelCompleted.toString());
        const now = new Date();
        const twentyFourHours = 24 * 60 * 60 * 1000;

        if (lastWinTime && (now - new Date(lastWinTime) < twentyFourHours)) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "عذراً، لم تمر 24 ساعة بعد على إتمام هذا المستوى!"
            });
        }

        user.waterSortCooldowns.set(levelCompleted.toString(), now);
        user.points = (user.points || 0) + Number(pointsEarned);

        if (levelCompleted >= (user.waterSortUnlockedLevel || 1)) {
            user.waterSortUnlockedLevel = levelCompleted + 1; // فتح المستوى التالي
        }

        await user.save({ session });

        await PointsHistory.create([{
            userId,
            amount: pointsEarned,
            source: "watersort_game",
            description: `ربحت ${pointsEarned} نقطة من إتمام مستوى الأنابيب ${levelCompleted}!`
        }], { session });

        await session.commitTransaction();

        res.json({
            success: true,
            totalPoints: user.points,
            unlockedLevel: user.waterSortUnlockedLevel || 1,
            message: "تم حفظ النقاط والمستوى بنجاح"
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

exports.checkLevelStatus = async (req, res) => {
    try {
        const { userId, level } = req.body;

        if (!userId || !level) {
            return res.status(400).json({ allowed: false, message: "بيانات غير صالحة" });
        }

        const user = await WheelUser.findOne({ userId });
        if (!user) {
            return res.status(404).json({ allowed: false, message: "المستخدم غير موجود" });
        }

        if (!user.waterSortCooldowns || !user.waterSortCooldowns.get(level.toString())) {
            return res.json({ allowed: true, message: "مسموح باللعب" });
        }

        const lastWinTime = new Date(user.waterSortCooldowns.get(level.toString()));
        const now = new Date();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const timeDiff = now - lastWinTime;

        if (timeDiff < twentyFourHours) {
            const remainingMs = twentyFourHours - timeDiff;
            const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
            const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

            return res.status(400).json({
                allowed: false,
                message: `عذراً، يجب الانتظار ${remainingHours} ساعة و ${remainingMinutes} دقيقة لإعادة هذا المستوى.`
            });
        }

        return res.json({ allowed: true, message: "مسموح باللعب" });

    } catch (e) {
        res.status(500).json({ allowed: false, message: e.message });
    }
};