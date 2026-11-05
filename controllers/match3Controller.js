const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
const mongoose = require("mongoose");

// ================= الإعدادات (مصدر واحد للقيم) =================
// السيرفر هو اللي كيقرر النقاط، التطبيق ما كيصيفطش pointsEarned خالص
const LEVEL_POINTS = 10;
const LEVEL_POINTS_DOUBLED = 20; // بعد مشاهدة إعلان المكافأة
const LEVEL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// تحديث نقاط ومستوى لعبة المطابقة عند الفوز مع حماية 24 ساعة ضد الغش
exports.updateScore = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // userId من توكن Firebase المتحقق منه، ماشي من body
        const userId = req.user?.uid;
        if (!userId) {
            await session.abortTransaction();
            return res.status(401).json({ success: false, message: "unauthorized" });
        }

        const { levelCompleted } = req.body;
        const doubled = req.body?.doubled === true;

        if (!levelCompleted || Number(levelCompleted) <= 0) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "بيانات غير صالحة أو المستوى غير مسجل"
            });
        }

        // القيمة ثابتة من السيرفر، بلا ما نثق في أي رقم جاي من التطبيق
        const pointsEarned = doubled ? LEVEL_POINTS_DOUBLED : LEVEL_POINTS;

        // البحث عن المستخدم باستخدام الموديل الموحد WheelUser
        const user = await WheelUser.findOne({ userId }).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: "المستخدم غير موجود"
            });
        }

        // تهيئة حقل الـ Map الخاص بالتبريد إذا لم يكن موجوداً
        if (!user.levelCooldowns) {
            user.levelCooldowns = new Map();
        }

        // التحقق من مرور 24 ساعة لمنع الغش وإعادة لعب نفس المستوى فوراً
        const lastWinTime = user.levelCooldowns.get(levelCompleted.toString());
        const now = new Date();

        if (lastWinTime && (now - new Date(lastWinTime) < LEVEL_COOLDOWN_MS)) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "عذراً، لم تمر 24 ساعة بعد على إتمام هذا المستوى!"
            });
        }

        // تسجيل وقت الفوز الحالي لهذا المستوى
        user.levelCooldowns.set(levelCompleted.toString(), now);

        // إضافة النقاط الثابتة إلى الرصيد الكلي
        user.points = (user.points || 0) + pointsEarned;

        // تحديث مستوى تقدم اللعبة إذا كان المستوى المكتمل أكبر أو يساوي المخزن حالياً
        if (levelCompleted >= (user.unlockedLevel || 1)) {
            user.unlockedLevel = levelCompleted + 1; // فتح المستوى التالي
        }

        await user.save({ session });

        // تسجيل العملية في السجل
        await PointsHistory.create([{
            userId,
            amount: pointsEarned,
            source: "match3_game",
            description: `ربحت ${pointsEarned} نقطة من إتمام المستوى ${levelCompleted}!`
        }], { session });

        await session.commitTransaction();

        res.json({
            success: true,
            totalPoints: user.points,
            unlockedLevel: user.unlockedLevel || 1,
            message: "تم حفظ النقاط والمستوى بنجاح"
        });

    } catch (e) {
        await session.abortTransaction();
        console.error("updateScore error:", e);
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
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ allowed: false, message: "unauthorized" });
        }

        const { level } = req.body;
        if (!level) {
            return res.status(400).json({ allowed: false, message: "بيانات غير صالحة" });
        }

        const user = await WheelUser.findOne({ userId });
        if (!user) {
            return res.status(404).json({ allowed: false, message: "المستخدم غير موجود" });
        }

        // إذا لم يكن قد لعب هذا المستوى من قبل، فهو مسموح له
        if (!user.levelCooldowns || !user.levelCooldowns.get(level.toString())) {
            return res.json({ allowed: true, message: "مسموح باللعب" });
        }

        const lastWinTime = new Date(user.levelCooldowns.get(level.toString()));
        const now = new Date();
        const timeDiff = now - lastWinTime;

        if (timeDiff < LEVEL_COOLDOWN_MS) {
            const remainingMs = LEVEL_COOLDOWN_MS - timeDiff;
            const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
            const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

            return res.status(400).json({
                allowed: false,
                message: `عذراً، يجب الانتظار ${remainingHours} ساعة و ${remainingMinutes} دقيقة لإعادة هذا المستوى.`
            });
        }

        return res.json({ allowed: true, message: "مسموح باللعب" });

    } catch (e) {
        console.error("checkLevelStatus error:", e);
        res.status(500).json({ allowed: false, message: e.message });
    }
};
