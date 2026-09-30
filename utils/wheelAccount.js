// utils/wheelAccount.js
// دالة واحدة لإنشاء حساب العجلة (تُستعمل في العجلة والإحالات) لتفادي حسابات ناقصة
const WheelUser = require("../models/WheelUser");
const { generateReferralCode } = require("./crypto");

const DAY_MS = 24 * 60 * 60 * 1000;

async function ensureAccount(userId) {
  const now = new Date();
  let account;

  try {
    account = await WheelUser.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          points: 0,
          spinsLeft: 1,
          referralCode: generateReferralCode(userId),
          referredBy: "",
          referralStatus: "none",
          friendPoints: 0,
          nextSpinTime: now,
          adsWatchedToday: 0,
          adsResetTime: new Date(now.getTime() + DAY_MS),
          registeredContest: 0,
          pendingAdToken: null,
          adTokenExpiresAt: null,
          adVerified: false,
        },
      },
      { upsert: true, new: true }
    );
  } catch (e) {
    // طلبان متزامنان أنشآ نفس المستخدم: نقرأ الحساب الموجود
    if (e.code === 11000) account = await WheelUser.findOne({ userId });
    else throw e;
  }

  // ترقيع الحسابات القديمة التي تنقصها حقول أساسية
  const patch = {};
  if (!account.nextSpinTime) patch.nextSpinTime = now;
  if (!account.adsResetTime) patch.adsResetTime = new Date(now.getTime() + DAY_MS);
  if (Object.keys(patch).length) {
    await WheelUser.updateOne({ userId }, { $set: patch });
    Object.assign(account, patch);
  }

  return account;
}

module.exports = { ensureAccount };
