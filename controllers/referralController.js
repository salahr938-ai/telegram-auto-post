// controllers/referralController.js
const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
const { getDbStatus } = require("../config/dbStatus");
const { ensureAccount } = require("../utils/wheelAccount");

const REFERRAL_REWARD_POINTS = 100;

// ================= تسجيل الإحالة (مرة واحدة، قبل أي لعب) =================
const registerReferral = async (req, res) => {
  if (!getDbStatus()) return res.status(503).send("⏳ DB not ready");
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).send("❌ unauthorized");

    const referrerCode = String(req.body?.referrerCode || "").trim();
    if (!referrerCode) return res.status(400).send("❌ كود الإحالة مطلوب");

    const inviter = await WheelUser.findOne({ referralCode: referrerCode });
    if (!inviter) return res.status(404).send("❌ كود الإحالة غير صحيح");
    if (inviter.userId === userId) {
      return res.status(400).send("❌ لا يمكنك استخدام كود الإحالة الخاص بك");
    }

    await ensureAccount(userId);

    // عملية ذرية: تنجح مرة واحدة فقط، ولمن لم يبدأ اللعب بعد
    const updated = await WheelUser.findOneAndUpdate(
      { userId, referredBy: { $in: ["", null] }, points: 0 },
      { $set: { referredBy: referrerCode, referralStatus: "pending" } },
      { new: true }
    );
    if (!updated) return res.status(400).send("❌ لا يمكن تسجيل الإحالة لهذا الحساب");

    res.json({ success: true, message: "تم تسجيل الإحالة بنجاح 🎉" });
  } catch (err) {
    console.error("❌ REGISTER REFERRAL ERROR:", err);
    res.status(500).send("❌ خطأ في السيرفر");
  }
};

// ================= عدد الإحالات (معلقة ومؤكدة) =================
const getMyInvites = async (req, res) => {
  if (!getDbStatus()) return res.status(503).send("⏳ DB not ready");
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).send("❌ unauthorized");

    const user = await WheelUser.findOne({ userId });
    if (!user || !user.referralCode) return res.status(404).send("❌ غير موجود");

    const rows = await WheelUser.aggregate([
      { $match: { referredBy: user.referralCode } },
      { $group: { _id: "$referralStatus", n: { $sum: 1 } } },
    ]);
    const count = (s) => rows.find((r) => r._id === s)?.n || 0;

    res.json({ pendingCount: count("pending"), confirmedCount: count("confirmed") });
  } catch (err) {
    console.error("❌ GET MY INVITES ERROR:", err);
    res.status(500).send("❌ خطأ في السيرفر");
  }
};

// ================= مكافأة الداعي عند فوز صديقه =================
// تُستدعى من drawWinners في wheelController لحظة اختيار الفائزين
const processContestWinnersAndReferrals = async (winningUserIds) => {
  try {
    for (const winnerUserId of winningUserIds) {
      // ينجح مرة واحدة فقط لكل فائز (يمنع تكرار المكافأة)
      const winner = await WheelUser.findOneAndUpdate(
        { userId: winnerUserId, referredBy: { $nin: ["", null] }, referralStatus: "pending" },
        { $set: { referralStatus: "confirmed" } },
        { new: true }
      );
      if (!winner) continue;

      const inviter = await WheelUser.findOneAndUpdate(
        { referralCode: winner.referredBy },
        { $inc: { points: REFERRAL_REWARD_POINTS } }
      );
      if (!inviter) continue;

      await PointsHistory.create({
        userId: inviter.userId,
        amount: REFERRAL_REWARD_POINTS,
        source: "referral_win",
        description: `🎁 مكافأة ${REFERRAL_REWARD_POINTS} نقطة لفوز صديقك في المسابقة!`,
      });
    }
  } catch (err) {
    console.error("❌ PROCESS WINNERS & REFERRALS ERROR:", err);
  }
};

module.exports = { registerReferral, getMyInvites, processContestWinnersAndReferrals };
