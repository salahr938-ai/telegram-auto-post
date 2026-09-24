const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");
const firestore = require("../firebase");
const { generateReferralCode } = require("../utils/crypto"); 
const { getDbStatus } = require("../config/dbStatus");

// ================= 1. تأكيد الإحالة ومنح 0.20 للداعي عند الفوز =================
exports.confirmReferral = async (req, res) => {
    if (!getDbStatus()) return res.status(503).send("⏳ DB not ready");
    try {
        const { userId } = req.body; // معرف الصديق المدعو
        if (!userId) return res.status(400).send("❌ userId required");

        const user = await WheelUser.findOne({ userId });
        if (!user) return res.status(404).send("❌ المستخدم غير موجود");
        
        if (!user.referredBy || user.referralStatus !== "pending") {
           return res.status(400).send("❌ لا يمكنك التحصيل: إما لا توجد دعوة أو تم التحصيل مسبقاً");
        }

        // 🎯 الشرط: التأكد أن الصديق وصل لـ 500 نقطة وحقق الفوز في المسابقة
        if (user.points < 500) {
            return res.status(400).send("❌ لم يصل المستخدم بعد إلى 500 نقطة المطلوبة");
        }

        // تحديث حالة المدعو ليصبح الفوز مؤكداً لديه
        user.referralStatus = "confirmed";
        await user.save();

        // 💰 إضافة 0.20 إلى "رصيد الأصدقاء" (friendPoints) الخاص بالداعي (Inviter)
        const inviter = await WheelUser.findOne({ referralCode: user.referredBy });
        if (inviter) {
            // زيادة الرصيد بصيغة عشرية صحيحة (تجنب مشاكل الأرقام العشرية في جافاسكريبت)
            inviter.friendPoints = Number(((inviter.friendPoints || 0) + 0.20).toFixed(2));
            await inviter.save();

            // تسجيل العملية في التاريخ
            await PointsHistory.create({
                userId: inviter.userId, 
                amount: 0.20,
                source: 'friend_points',
                description: 'مكافأة نجاح ودعوة صديق في المسابقة 🎉'
            });
        }

        // مزامنة الحالة مع فايرستور
        try {
            await firestore.collection("users").doc(userId).update({ referralStatus: "confirmed" });
        } catch (e) { console.log("⚠️ Firebase update skipped"); }

        res.json({ success: true, message: "تم تأكيد فوز الإحالة بنجاح!" });
    } catch (err) {
        console.log("❌ REFERRAL ERROR:", err);
        res.status(500).send("❌ خطأ في الخادم");
    }
};

// ================= 2. تسجيل الإحالة عند استخدام الكود لأول مرة =================
exports.registerReferral = async (req, res) => {
    if (!getDbStatus()) return res.status(503).send("⏳ DB not ready");
    try {
        const { userId, referrerCode } = req.body;
        if (!userId || !referrerCode) return res.status(400).send("❌ بيانات ناقصة");

        // حماية: منع المستخدم من استخدام كود الإحالة الخاص به لنفسه
        const selfCheck = await WheelUser.findOne({ userId });
        if (selfCheck && selfCheck.referralCode === referrerCode) {
            return res.status(400).send("❌ لا يمكنك استخدام كود الإحالة الخاص بك");
        }

        let user = await WheelUser.findOne({ userId });
        
        if (!user) {
            const finalCode = generateReferralCode(userId);
            user = await WheelUser.create({
                userId,
                spinsLeft: 3,
                referralCode: finalCode,
                referredBy: referrerCode,
                referralStatus: "pending",
                friendPoints: 0.0 // تهيئة رصيد الأصدقاء
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

// ================= 3. جلب عدد الإحالات (معلقة ومؤكدة) =================
exports.getMyInvites = async (req, res) => {
    if (!getDbStatus()) return res.status(503).send("⏳ DB not ready");
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).send("❌ userId required");

        const user = await WheelUser.findOne({ userId });
        if (!user) return res.status(404).send("❌ غير موجود");

        const pendingCount = await WheelUser.countDocuments({ referredBy: user.referralCode, referralStatus: "pending" });
        const confirmedCount = await WheelUser.countDocuments({ referredBy: user.referralCode, referralStatus: "confirmed" });

        res.json({ pendingCount, confirmedCount });
    } catch (err) {
        console.error("❌ GET MY INVITES ERROR:", err);
        res.status(500).send("❌ خطأ في السيرفر");
    }
};