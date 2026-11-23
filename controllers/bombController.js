const crypto = require("crypto");
const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");

const TILE_COUNT = 12;
const BOMB_COUNT = 3;
const MAX_DAILY_BOMB_ROUNDS = 5;
const POINT_VALUES = [5, 10, 10, 15, 20, 25, 50];
const DAY_MS = 24 * 60 * 60 * 1000;

const fail = (res, code, message) => res.status(code).json({ success: false, message });
const serverError = (res, tag, e) => {
  console.error(tag, e);
  return fail(res, 500, "خطأ في السيرفر");
};

function genRound() {
  const bombs = new Set();
  while (bombs.size < BOMB_COUNT) bombs.add(crypto.randomInt(TILE_COUNT));
  const tileValues = Array.from({ length: TILE_COUNT }, (_, i) =>
    bombs.has(i) ? 0 : POINT_VALUES[crypto.randomInt(POINT_VALUES.length)]
  );
  return {
    bombIndexes: [...bombs],
    tileValues,
    pickedIndexes: [],
    points: 0,
    reviveUsed: false,
    status: "playing",
  };
}

const safePicked = (a) => a.pickedIndexes.filter((i) => !a.bombIndexes.includes(i)).length;

// الوقت المتبقي (بالميلي ثانية) حتى تتجدد جولات اليوم؛ 0 إذا كانت النافذة منتهية
const resetInMsOf = (bombGame, now = new Date()) => {
  const lr = bombGame?.lastResetDate;
  if (!lr) return 0;
  return Math.max(0, new Date(lr).getTime() + DAY_MS - now.getTime());
};

// ───────────────────────── status (+ استئناف الجولة) ─────────────────────────
exports.getStatus = async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return fail(res, 401, "unauthorized");

    const user = await WheelUser.findOne({ userId });
    if (!user) return fail(res, 404, "المستخدم غير موجود");

    const now = new Date();
    const b = user.bombGame || {};
    const windowOpen = b.lastResetDate && now - new Date(b.lastResetDate) < DAY_MS;
    const used = windowOpen ? b.roundsPlayedToday || 0 : 0;
    const remainingRounds = Math.max(0, MAX_DAILY_BOMB_ROUNDS - used);

    const a = b.active;
    // لا نرسل إلا المربعات المكشوفة، ولا نكشف باقي اللوحة أبداً
    const resume =
      a && (a.status === "playing" || a.status === "exploded")
        ? {
            status: a.status,
            roundPoints: a.points,
            reviveUsed: a.reviveUsed,
            picked: a.pickedIndexes.map((i) => ({
              index: i,
              isBomb: a.bombIndexes.includes(i),
              points: a.tileValues[i],
            })),
          }
        : null;

    return res.json({
      success: true,
      allowed: remainingRounds > 0,
      remainingRounds,
      resetInMs: remainingRounds > 0 ? 0 : resetInMsOf(b, now),
      maxRounds: MAX_DAILY_BOMB_ROUNDS,
      totalPoints: user.points || 0,
      resume,
      message:
        remainingRounds > 0
          ? `متبقي لك ${remainingRounds} جولات اليوم`
          : "لقد أنهيت الحد اليومي لجولات لعبة القنابل، عد غداً!",
    });
  } catch (e) {
    return serverError(res, "bomb status", e);
  }
};

// ───────────────────────── start ─────────────────────────
exports.startRound = async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return fail(res, 401, "unauthorized");

    const now = new Date();
    const cutoff = new Date(now - DAY_MS);
    const active = genRound();

    // 1) النافذة اليومية سارية: زيادة العدّاد ذرياً بشرط عدم بلوغ الحد
    let user = await WheelUser.findOneAndUpdate(
      {
        userId,
        "bombGame.lastResetDate": { $gt: cutoff },
        "bombGame.roundsPlayedToday": { $lt: MAX_DAILY_BOMB_ROUNDS },
      },
      {
        $inc: { "bombGame.roundsPlayedToday": 1 },
        $set: { "bombGame.lastRoundAt": now, "bombGame.active": active },
      },
      { new: true }
    );

    // 2) النافذة منتهية أو لم تبدأ: تصفير العدّاد وبدء نافذة جديدة
    if (!user) {
      user = await WheelUser.findOneAndUpdate(
        {
          userId,
          $or: [{ "bombGame.lastResetDate": null }, { "bombGame.lastResetDate": { $lte: cutoff } }],
        },
        {
          $set: {
            "bombGame.roundsPlayedToday": 1,
            "bombGame.lastResetDate": now,
            "bombGame.lastRoundAt": now,
            "bombGame.active": active,
          },
        },
        { new: true }
      );
    }

    if (!user) {
      const cur = await WheelUser.findOne({ userId }, { bombGame: 1 });
      return res.status(400).json({
        success: false,
        allowed: false,
        remainingRounds: 0,
        resetInMs: resetInMsOf(cur?.bombGame, now),
        message: "لقد أنهيت الحد اليومي لجولات لعبة القنابل، عد غداً!",
      });
    }

    return res.json({
      success: true,
      allowed: true,
      remainingRounds: Math.max(0, MAX_DAILY_BOMB_ROUNDS - user.bombGame.roundsPlayedToday),
      totalPoints: user.points || 0,
      tileCount: TILE_COUNT,
      message: "بدأت الجولة",
    });
  } catch (e) {
    return serverError(res, "bomb start", e);
  }
};

// ───────────────────────── pick ─────────────────────────
exports.pickTile = async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return fail(res, 401, "unauthorized");

    const index = Number(req.body?.index);
    if (!Number.isInteger(index) || index < 0 || index >= TILE_COUNT) {
      return fail(res, 400, "مربع غير صالح");
    }

    const user = await WheelUser.findOne({ userId }, { bombGame: 1 });
    const a = user?.bombGame?.active;
    if (!a || a.status !== "playing" || a.pickedIndexes.includes(index)) {
      return fail(res, 400, "لا يمكن كشف هذا المربع");
    }

    const isBomb = a.bombIndexes.includes(index);
    const gained = isBomb ? 0 : a.tileValues[index];

    const upd = await WheelUser.findOneAndUpdate(
      {
        userId,
        "bombGame.active.status": "playing",
        "bombGame.active.pickedIndexes": { $ne: index },
      },
      {
        $push: { "bombGame.active.pickedIndexes": index },
        $inc: { "bombGame.active.points": gained },
        ...(isBomb ? { $set: { "bombGame.active.status": "exploded" } } : {}),
      },
      { new: true }
    );
    if (!upd) return fail(res, 409, "طلب مكرر");

    const na = upd.bombGame.active;
    return res.json({
      success: true,
      isBomb,
      points: gained,
      roundPoints: na.points,
      status: na.status,
      safeLeft: TILE_COUNT - BOMB_COUNT - safePicked(na),
      revivable: isBomb && !na.reviveUsed,
    });
  } catch (e) {
    return serverError(res, "bomb pick", e);
  }
};

// ───────────────────────── revive ─────────────────────────
// تنبيه: هذا المسار لا يثبت أن المستخدم شاهد الإعلان فعلاً.
// للحماية الكاملة اربطه بـ AdMob Server-Side Verification.
exports.reviveRound = async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return fail(res, 401, "unauthorized");

    const user = await WheelUser.findOneAndUpdate(
      { userId, "bombGame.active.status": "exploded", "bombGame.active.reviveUsed": false },
      { $set: { "bombGame.active.status": "playing", "bombGame.active.reviveUsed": true } },
      { new: true }
    );
    if (!user) return fail(res, 400, "لا يمكن إبطال القنبلة");

    return res.json({
      success: true,
      roundPoints: user.bombGame.active.points,
      status: "playing",
    });
  } catch (e) {
    return serverError(res, "bomb revive", e);
  }
};

// ───────────────────────── claim ─────────────────────────
exports.claimPoints = async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return fail(res, 401, "unauthorized");

    const user = await WheelUser.findOne({ userId }, { bombGame: 1 });
    const a = user?.bombGame?.active;
    if (!a || a.status !== "playing" || a.points <= 0) {
      return fail(res, 400, "لا توجد نقاط للاستلام");
    }

    const amount = a.points;
    const cleared = safePicked(a) === TILE_COUNT - BOMB_COUNT;

    // الصرف ذري: تُغلق الجولة في نفس العملية فلا يمكن صرفها مرتين
    const upd = await WheelUser.findOneAndUpdate(
      { userId, "bombGame.active.status": "playing", "bombGame.active.points": amount },
      {
        $inc: { points: amount },
        $set: { "bombGame.active.status": "none", "bombGame.active.points": 0 },
      },
      { new: true }
    );
    if (!upd) return fail(res, 409, "طلب مكرر");

    await PointsHistory.create({
      userId,
      amount,
      source: "bomb_game",
      description: cleared
        ? `ربحت ${amount} نقطة بعد كشف كل المربعات الآمنة في لعبة القنابل!`
        : `انسحبت وربحت ${amount} نقطة من لعبة القنابل!`,
    });

    return res.json({
      success: true,
      totalPoints: upd.points,
      addedPoints: amount,
      remainingRounds: Math.max(0, MAX_DAILY_BOMB_ROUNDS - (upd.bombGame.roundsPlayedToday || 0)),
      resetInMs: resetInMsOf(upd.bombGame),
      cleared,
      message: "تم حفظ النقاط بنجاح",
    });
  } catch (e) {
    return serverError(res, "bomb claim", e);
  }
};
