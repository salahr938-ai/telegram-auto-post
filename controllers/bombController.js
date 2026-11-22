const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
const mongoose = require("mongoose");

const MAX_BOMB_POINTS_PER_ROUND = 450;
const MAX_DAILY_BOMB_ROUNDS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

function getNormalizedBombState(user, now) {
    const bomb = user.bombGame || {};
    const lastReset = bomb.lastResetDate ? new Date(bomb.lastResetDate) : null;

    if (!lastReset || (now - lastReset) >= DAY_MS) {
        return {
            roundsPlayedToday: 0,
            lastResetDate: lastReset,
            lastRoundAt: bomb.lastRoundAt || null,
            expired: true
        };
    }

    return {
        roundsPlayedToday: bomb.roundsPlayedToday || 0,
        lastResetDate: lastReset,
        lastRoundAt: bomb.lastRoundAt || null,
        expired: false
    };
}

// فحص حالة الجولات المتبقية والرصيد الحالي
exports.getStatus = async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ success: false, allowed: false, message: "unauthorized" });
        }

        const user = await WheelUser.findOne({ userId });
        if (!user) {
            return res.status(404).json({ success: false, allowed: false, message: "المستخدم غير موجود" });
        }

        const now = new Date();
        const state = getNormalizedBombState(user, now);
        const remainingRounds = Math.max(0, MAX_DAILY_BOMB_ROUNDS - state.roundsPlayedToday);

        return res.json({
            success: true,
            allowed: remainingRounds > 0,
            remainingRounds,
            maxRounds: MAX_DAILY_BOMB_ROUNDS,
            totalPoints: user.points || 0,
            message: remainingRounds > 0
                ? `متبقي لك ${remainingRounds} جولات اليوم`
                : "لقد أنهيت الحد اليومي لجولات لعبة القنابل، عد غداً!"
        });
    } catch (e) {
        console.error("bomb getStatus error:", e);
        return res.status(500).json({ success: false, allowed: false, message: e.message || "خطأ في السيرفر" });
    }
};

// حساب الجولة ضمن الحد اليومي بمجرد بدء اللعب (أول ضغطة أو بدء الجولة)
exports.startRound = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const userId = req.user?.uid;
        if (!userId) {
            await session.abortTransaction();
            return res.status(401).json({ success: false, allowed: false, message: "unauthorized" });
        }

        const user = await WheelUser.findOne({ userId }).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, allowed: false, message: "المستخدم غير موجود" });
        }

        const now = new Date();
        const state = getNormalizedBombState(user, now);
        const currentRounds = state.expired ? 0 : state.roundsPlayedToday;
        const resetDate = state.expired ? now : state.lastResetDate;

        if (currentRounds >= MAX_DAILY_BOMB_ROUNDS) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                allowed: false,
                remainingRounds: 0,
                totalPoints: user.points || 0,
                message: "لقد أنهيت الحد اليومي لجولات لعبة القنابل، عد غداً!"
            });
        }

        const nextRoundsPlayed = currentRounds + 1;

        user.bombGame = {
            roundsPlayedToday: nextRoundsPlayed,
            lastResetDate: resetDate,
            lastRoundAt: now
        };

        await user.save({ session });
        await session.commitTransaction();

        const remainingRounds = Math.max(0, MAX_DAILY_BOMB_ROUNDS - nextRoundsPlayed);

        return res.json({
            success: true,
            allowed: true,
            remainingRounds,
            totalPoints: user.points || 0,
            message: "تم احتساب الجولة بنجاح"
        });
    } catch (e) {
        await session.abortTransaction();
        console.error("bomb startRound error:", e);
        return res.status(500).json({ success: false, allowed: false, message: e.message || "خطأ في السيرفر" });
    } finally {
        session.endSession();
    }
};

// استلام النقاط عند الانسحاب أو كشف كل المربعات الآمنة (دون زيادة عدد الجولات مرة أخرى)
exports.claimPoints = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const userId = req.user?.uid;
        if (!userId) {
            await session.abortTransaction();
            return res.status(401).json({ success: false, message: "unauthorized" });
        }

        const pointsEarned = Number(req.body?.pointsEarned);
        const reason = req.body?.reason === "CLEARED" ? "CLEARED" : "CASHOUT";

        if (!Number.isFinite(pointsEarned) || pointsEarned <= 0 || !Number.isInteger(pointsEarned)) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "قيمة النقاط غير صالحة" });
        }

        if (pointsEarned > MAX_BOMB_POINTS_PER_ROUND) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "قيمة النقاط تجاوزت الحد المسموح للجولة" });
        }

        const user = await WheelUser.findOne({ userId }).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
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

        const now = new Date();
        const state = getNormalizedBombState(user, now);
        const remainingRounds = Math.max(0, MAX_DAILY_BOMB_ROUNDS - (state.expired ? 0 : state.roundsPlayedToday));

        return res.json({
            success: true,
            totalPoints: user.points,
            addedPoints: pointsEarned,
            remainingRounds,
            message: "تم حفظ النقاط بنجاح"
        });
    } catch (e) {
        await session.abortTransaction();
        console.error("bomb claimPoints error:", e);
        return res.status(500).json({ success: false, message: e.message || "خطأ في السيرفر" });
    } finally {
        session.endSession();
    }
};