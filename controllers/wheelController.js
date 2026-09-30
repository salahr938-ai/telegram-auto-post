// controllers/wheelController.js
const crypto = require("crypto");
const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
const Contest = require("../models/Contest");
const AdTransaction = require("../models/AdTransaction");
const { getDbStatus } = require("../config/dbStatus");
const { ensureAccount } = require("../utils/wheelAccount");
const { processContestWinnersAndReferrals } = require("./referralController");

// ================= الإعدادات (مصدر واحد للقيم) =================
// للاختبار: شغّل السيرفر بـ POINTS_TO_ENTER=30 MAX_PARTICIPANTS=4
const POINTS_TO_ENTER = Number(process.env.POINTS_TO_ENTER) || 500;
const MAX_PARTICIPANTS = Number(process.env.MAX_PARTICIPANTS) || 500;
const WINNERS_COUNT = 3;
const MAX_ADS_PER_DAY = 3;
const SPIN_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const AD_TOKEN_TTL_MS = 5 * 60 * 1000;
const RESET_POINTS_ON_ENTRY = true; // true = يُخصم 500 نقطة عند دخول السحب

const PRIZES = [10, 20, 30, 40, 50, 60];
const WEIGHTS = [10, 20, 30, 25, 10, 5];

function pickIndex() {
  const total = WEIGHTS.reduce((s, w) => s + w, 0);
  let n = crypto.randomInt(0, total);
  for (let i = 0; i < WEIGHTS.length; i++) {
    if (n < WEIGHTS[i]) return i;
    n -= WEIGHTS[i];
  }
  return 0;
}

// ================= المسابقة =================
async function getActiveContest() {
  const existing = await Contest.findOne({ status: "active" });
  if (existing) return existing;
  try {
    const last = await Contest.findOne().sort({ contestNumber: -1 });
    return await Contest.create({
      contestNumber: (last?.contestNumber || 0) + 1,
      participantsCount: 0,
      maxParticipants: MAX_PARTICIPANTS,
      status: "active",
      winners: [],
    });
  } catch (e) {
    if (e.code === 11000) return Contest.findOne({ status: "active" }); // سبقنا طلب آخر
    throw e;
  }
}

async function drawWinners(contest) {
  // طلب واحد فقط ينجح في قفل الدورة
  const locked = await Contest.findOneAndUpdate(
    { _id: contest._id, status: "active" },
    { $set: { status: "drawing" } }
  );
  if (!locked) return;

  const picked = await WheelUser.aggregate([
    { $match: { registeredContest: contest.contestNumber } },
    { $sample: { size: WINNERS_COUNT } },
  ]);

  await Contest.updateOne(
    { _id: contest._id },
    {
      $set: {
        status: "completed",
        winners: picked.map((w) => ({
          userId: w.userId,
          maskedName: `User_${w.userId.slice(0, 4)}***`,
          prize: "3$",
          wonAt: new Date(),
        })),
      },
    }
  );

  await processContestWinnersAndReferrals(picked.map((w) => w.userId));
  await getActiveContest(); // ينشئ الدورة التالية
}

// ================= الإعلانات =================
async function resetAdsIfNeeded(userId, now) {
  await WheelUser.updateOne(
    {
      userId,
      $or: [{ adsResetTime: { $lte: now } }, { adsResetTime: null }],
    },
    { $set: { adsWatchedToday: 0, adsResetTime: new Date(now.getTime() + DAY_MS) } }
  );
}

// 1) التطبيق يطلب رمزاً قبل عرض الإعلان
exports.requestAdSession = async (req, res) => {
  if (!getDbStatus()) return res.status(503).send("⏳ DB not ready");
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).send("❌ unauthorized");

    const now = new Date();
    await ensureAccount(userId);
    await resetAdsIfNeeded(userId, now);

    const adToken = crypto.randomBytes(16).toString("hex");
    const account = await WheelUser.findOneAndUpdate(
      { userId, adsWatchedToday: { $lt: MAX_ADS_PER_DAY } },
      {
        $set: {
          pendingAdToken: adToken,
          adTokenExpiresAt: new Date(now.getTime() + AD_TOKEN_TTL_MS),
          adVerified: false,
        },
      },
      { new: true }
    );
    if (!account) return res.status(400).send("⚠️ لقد استنفذت الحد الأقصى لإعلانات اليوم");

    res.json({ success: true, adToken, adsWatchedToday: account.adsWatchedToday });
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ خطأ في السيرفر");
  }
};

// 2) AdMob Server-Side Verification: جوجل هي التي تستدعي هذا المسار
let keyCache = { at: 0, keys: {} };
async function getAdmobKeys() {
  if (Date.now() - keyCache.at < DAY_MS && Object.keys(keyCache.keys).length) return keyCache.keys;
  const r = await fetch("https://www.gstatic.com/admob/reward/verifier-keys.json");
  const j = await r.json();
  keyCache = {
    at: Date.now(),
    keys: Object.fromEntries(j.keys.map((k) => [String(k.keyId), k.pem])),
  };
  return keyCache.keys;
}

async function verifyAdmobSsv(originalUrl) {
  const q = originalUrl.indexOf("?");
  if (q === -1) return false;
  const query = originalUrl.slice(q + 1);

  // signature و key_id هما آخر معاملين دائماً، والنص الموقَّع هو ما قبلهما
  const sigIdx = query.indexOf("&signature=");
  if (sigIdx === -1) return false;
  const message = query.slice(0, sigIdx);
  const tail = new URLSearchParams(query.slice(sigIdx + 1));
  const signature = tail.get("signature");
  const keyId = tail.get("key_id");
  if (!signature || !keyId) return false;

  let keys = await getAdmobKeys();
  if (!keys[keyId]) {
    keyCache.at = 0; // مفتاح جديد؟ أعد الجلب مرة
    keys = await getAdmobKeys();
  }
  if (!keys[keyId]) return false;

  const sig = Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const verifier = crypto.createVerify("SHA256");
  verifier.update(message);
  return verifier.verify(keys[keyId], sig);
}

exports.adSsvCallback = async (req, res) => {
  try {
    if (!(await verifyAdmobSsv(req.originalUrl))) return res.sendStatus(403);

    const { user_id, custom_data, transaction_id } = req.query;
    if (!user_id || !custom_data || !transaction_id) return res.sendStatus(400);

    try {
      await AdTransaction.create({ transactionId: String(transaction_id) });
    } catch (e) {
      if (e.code === 11000) return res.sendStatus(200); // معاملة مكررة
      throw e;
    }

    await WheelUser.updateOne(
      {
        userId: String(user_id),
        pendingAdToken: String(custom_data),
        adTokenExpiresAt: { $gt: new Date() },
      },
      { $set: { adVerified: true } }
    );
    res.sendStatus(200);
  } catch (err) {
    console.error("SSV error:", err);
    res.sendStatus(500);
  }
};

// ================= حالة العجلة =================
exports.getWheelStatus = async (req, res) => {
  if (!getDbStatus()) return res.status(503).send("⏳ DB not ready");
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).send("❌ unauthorized");

    const now = new Date();
    await ensureAccount(userId);
    await resetAdsIfNeeded(userId, now);

    const account = await WheelUser.findOne({ userId });
    const contest = await getActiveContest();

    res.json({
      points: account.points,
      spinsLeft: account.nextSpinTime <= now ? 1 : 0,
      lastPrize: account.lastPrize || "0",
      adsWatchedToday: account.adsWatchedToday || 0,
      nextSpinTime: account.nextSpinTime,

      // المصدر الوحيد لبيانات المسابقة: وثيقة Contest النشطة
      participantsCount: contest.participantsCount,
      maxParticipants: contest.maxParticipants,
      isRegistered: account.registeredContest === contest.contestNumber,

      friendPoints: account.friendPoints || 0,
      referralCode: account.referralCode,
      referredBy: account.referredBy,
      referralStatus: account.referralStatus,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ خطأ في السيرفر");
  }
};

// ================= تدوير العجلة =================
exports.spinWheel = async (req, res) => {
  if (!getDbStatus()) return res.status(503).send("⏳ DB not ready");
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).send("❌ unauthorized");

    const isAdReward = req.body?.isAdReward === true;
    const adToken = typeof req.body?.adToken === "string" ? req.body.adToken : "";
    const now = new Date();

    await ensureAccount(userId);
    await resetAdsIfNeeded(userId, now);

    const index = pickIndex();
    const reward = PRIZES[index];

    let filter, update;
    if (isAdReward) {
      if (!adToken) return res.status(400).send("❌ رمز الإعلان مطلوب");
      filter = {
        userId,
        pendingAdToken: adToken,
        adTokenExpiresAt: { $gt: now },
        adVerified: true, // أكّدته جوجل عبر SSV
        adsWatchedToday: { $lt: MAX_ADS_PER_DAY },
      };
      update = {
        $inc: { adsWatchedToday: 1, points: reward },
        $set: {
          lastPrize: String(reward),
          pendingAdToken: null,
          adTokenExpiresAt: null,
          adVerified: false,
        },
      };
    } else {
      filter = { userId, nextSpinTime: { $lte: now } };
      update = {
        $inc: { points: reward },
        $set: {
          lastPrize: String(reward),
          spinsLeft: 0,
          nextSpinTime: new Date(now.getTime() + SPIN_COOLDOWN_MS),
        },
      };
    }

    // عملية ذرية واحدة: التحقق من الأهلية + خصم اللفة + إضافة النقاط
    const account = await WheelUser.findOneAndUpdate(filter, update, { new: true });
    if (!account) {
      if (isAdReward) {
        const waiting = await WheelUser.exists({
          userId,
          pendingAdToken: adToken,
          adTokenExpiresAt: { $gt: now },
          adVerified: false,
        });
        // الرمز سليم لكن جوجل لم تؤكد بعد: التطبيق يعيد المحاولة
        if (waiting) return res.status(409).send("⏳ بانتظار تأكيد الإعلان");
        return res.status(400).send("❌ رمز الإعلان غير صالح أو انتهت صلاحيته");
      }
      return res.status(400).send("⚠️ لا توجد لفة متاحة الآن");
    }

    let points = account.points;

    // ---------- التسجيل في المسابقة ----------
    let contest = await getActiveContest();
    let registered = account.registeredContest === contest.contestNumber;

    if (!registered && account.points >= POINTS_TO_ENTER) {
      const claimed = await WheelUser.updateOne(
        { userId, registeredContest: { $ne: contest.contestNumber } },
        { $set: { registeredContest: contest.contestNumber } }
      );
      if (claimed.modifiedCount === 1) {
        const joined = await Contest.findOneAndUpdate(
          {
            _id: contest._id,
            status: "active",
            $expr: { $lt: ["$participantsCount", "$maxParticipants"] },
          },
          { $inc: { participantsCount: 1 } },
          { new: true }
        );

        if (!joined) {
          // الدورة امتلأت للتو: نتراجع، وسيُسجَّل في الدورة التالية
          await WheelUser.updateOne({ userId }, { $set: { registeredContest: 0 } });
        } else {
          registered = true;
          contest = joined;
          if (RESET_POINTS_ON_ENTRY) {
            await WheelUser.updateOne({ userId }, { $inc: { points: -POINTS_TO_ENTER } });
            points -= POINTS_TO_ENTER;
          }
          if (joined.participantsCount >= joined.maxParticipants) {
            try {
              await drawWinners(joined);
            } catch (e) {
              console.error("drawWinners failed:", e);
            }
          }
        }
      }
    }

    await PointsHistory.create({
      userId,
      amount: reward,
      source: "wheel",
      description: "الفوز في عجلة الحظ 🎡",
    });

    res.json({
      index,
      newPoints: points,
      spinsLeft: account.nextSpinTime <= new Date() ? 1 : 0,
      lastPrize: account.lastPrize,
      adsWatchedToday: account.adsWatchedToday,
      nextSpinTime: account.nextSpinTime,
      isRegistered: registered,
      participantsCount: contest.participantsCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ خطأ في السيرفر");
  }
};

// ================= معلومات المسابقة (عام، بلا بيانات شخصية) =================
const toPublic = (c) => ({
  contestNumber: c.contestNumber,
  winners: (c.winners || []).map((w) => ({
    maskedName: w.maskedName,
    prize: w.prize,
    wonAt: w.wonAt,
  })),
});

exports.getContestInfo = async (req, res) => {
  if (!getDbStatus()) return res.status(503).send("⏳ DB not ready");
  try {
    const active = await Contest.findOne({ status: "active" });
    const past = await Contest.find({ status: "completed" })
      .sort({ contestNumber: -1 })
      .limit(10);

    res.json({
      currentContestNumber: active?.contestNumber || 1,
      participantsCount: active?.participantsCount || 0,
      maxParticipants: active?.maxParticipants || MAX_PARTICIPANTS,
      pastContests: past.map(toPublic),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ خطأ في السيرفر");
  }
};
