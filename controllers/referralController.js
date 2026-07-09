const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
// استيراد المتغيرات الأساسية (تأكد من تعديل المسارات إذا لزم الأمر)
const { firestore } = require("../firebase"); 
const { generateReferralCode } = require("../utils/crypto"); 
// افترضنا أن isDbConnected معرفة في مكان مركزي أو يتم تمريرها
const { isDbConnected } = require("../index"); 

exports.confirmReferral = async (req, res) => {
  if (!isDbConnected) return res.status(503).send("⏳ DB not ready");
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).send("❌ userId required");

    const user = await WheelUser.findOne({ userId });
    if (!user) return res.status(404).send("❌ المستخدم غير موجود");
    
    if (!user.referredBy || user.referralStatus !== "pending") {
       return res.status(400).send("❌ لا يمكنك التحصيل: إما لا توجد دعوة أو تم التحصيل مسبقاً");
    }

    user.points += 5000;
    user.referralStatus = "confirmed";
    await user.save();

    await PointsHistory.create({
      userId: userId,
      amount: 5000,
      source: 'referral',
      description: 'مكافأة تفعيل كود الإحالة 🎉'
    });

    const inviter = await WheelUser.findOne({ referralCode: user.referredBy });
    if (inviter) {
      inviter.points += 5000;
      await inviter.save();
      await PointsHistory.create({
        userId: inviter.userId, 
        amount: 5000,
        source: 'referral',
        description: 'مكافأة دعوة صديق بنجاح 👥'
      });
    }

    try {
        await firestore.collection("users").doc(userId).update({ referralStatus: "confirmed" });
    } catch (e) { console.log("⚠️ Firebase update skipped"); }

    res.json({ success: true, newPoints: user.points });
  } catch (err) {
    console.log("❌ REFERRAL ERROR:", err);
    res.status(500).send("❌ خطأ في الخادم");
  }
};

exports.registerReferral = async (req, res) => {
    if (!isDbConnected) return res.status(503).send("⏳ DB not ready");
    try {
        const { userId, referrerCode } = req.body;
        if (!userId || !referrerCode) return res.status(400).send("❌ بيانات ناقصة");

        let user = await WheelUser.findOne({ userId });
        
        if (!user) {
            const finalCode = generateReferralCode(userId);
            user = await WheelUser.create({
                userId,
                spinsLeft: 3,
                referralCode: finalCode,
                referredBy: referrerCode,
                referralStatus: "pending"
            });
            return res.json({ success: true, message: "تم إنشاء الحساب وتسجيل الإحالة المعلقة بنجاح 🎉" });
        }

        if (!user.referredBy || user.referredBy === "") {
            user.referredBy = referrerCode;
            user.referralStatus = "pending";
            await user.save();
            return res.json({ success: true, message: "تم تسجيل الإحالة بنجاح" });
        } else {
            return res.status(400).send("❌ الإحالة مسجلة مسبقاً لهذا الحساب");
        }
    } catch (err) {
        console.error("❌ REGISTER REFERRAL ERROR:", err);
        res.status(500).send("❌ خطأ في السيرفر");
    }
};

exports.getMyInvites = async (req, res) => {
    if (!isDbConnected) return res.status(503).send("⏳ DB not ready");
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).send("❌ userId required");

        const user = await WheelUser.findOne({ userId });
        if (!user) return res.status(404).send("❌ غير موجود");

        const pendingCount = await WheelUser.countDocuments({ referredBy: user.referralCode, referralStatus: "pending" });
        const confirmedCount = await WheelUser.countDocuments({ referredBy: user.referralCode, referralStatus: "confirmed" });

        res.json({ pendingCount, confirmedCount });
    } catch (err) {
        res.status(500).send("❌ خطأ في السيرفر");
    }
};