const Dua = require("../models/Dua");
const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");

// ===================================
// 1. نشر دعاء جديد (مع كولداون 6 ساعات)
// ===================================
exports.publishDua = async (req, res) => {
    try {
        const userId = req.user.uid; // Firebase UID من الـ Middleware
        const { content, category } = req.body;

        if (!content) {
            return res.status(400).json({ success: false, message: "محتوى الدعاء مطلوب" });
        }

        const user = await WheelUser.findOne({ userId });
        if (!user) {
            return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
        }

        // فحص كولداون النشر (6 ساعات)
        if (user.lastPostDate) {
            const hoursSinceLastPost = (Date.now() - new Date(user.lastPostDate).getTime()) / (1000 * 60 * 60);
            if (hoursSinceLastPost < 6) {
                const remainingHours = (6 - hoursSinceLastPost).toFixed(1);
                return res.status(400).json({ 
                    success: false, 
                    message: `يجب عليك الانتظار لمدة ${remainingHours} ساعات لنشر دعاء جديد.` 
                });
            }
        }

        // إنشاء الدعاء
        const newDua = await Dua.create({
            userId: user.userId,
            authorName: user.name || "مستخدم مجهول",
            content,
            category: category || "دعاء"
        });

        // تحديث تاريخ آخر نشر للمستخدم
        user.lastPostDate = new Date();
        user.totalDuasPublished = (user.totalDuasPublished || 0) + 1;
        await user.save();

        res.status(201).json({ success: true, dua: newDua });

    } catch (err) {
        console.error("❌ PUBLISH DUA ERROR:", err);
        res.status(500).json({ success: false, message: "خطأ داخلي في السيرفر" });
    }
};

// ===================================
// 2. جلب قائمة الأدعية (Feed)
// ===================================
exports.getDuasFeed = async (req, res) => {
    try {
        const duas = await Dua.find().sort({ createdAt: -1 }).limit(100);
        res.json(duas);
    } catch (err) {
        console.error("❌ GET DUAS FEED ERROR:", err);
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
};

// ===================================
// 3. الإعجاب بدعاء (مع منع تكرار الإعجاب لنفس الدعاء، حصر ساعي، وتاريخ النقاط)
// ===================================
exports.likeDua = async (req, res) => {
    try {
        const userId = req.user.uid; // Firebase UID للمتفاعل
        const { duaId } = req.body;

        if (!duaId) {
            return res.status(400).json({ success: false, message: "معرف الدعاء مطلوب" });
        }

        const dua = await Dua.findById(duaId);
        if (!dua) {
            return res.status(404).json({ success: false, message: "الدعاء غير موجود" });
        }

        const user = await WheelUser.findOne({ userId });
        if (!user) {
            return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
        }

        // منع الإعجاب بالنفس
        if (dua.userId === user.userId) {
            return res.status(400).json({ success: false, message: "لا يمكنك الإعجاب بدعائك الخاص!" });
        }

        // التحقق مما إذا كان قد أعجب به مسبقاً
        if (dua.likedBy && dua.likedBy.includes(user._id.toString())) {
            return res.status(400).json({ success: false, message: "لقد اعجبت بهذا الدعاء مسبقاً" });
        }

        // تحديث نقاط المتفاعل (+5 نقاط)
        user.points = (user.points || 0) + 5;
        await user.save();

        // 📝 تسجيل النقاط في PointsHistory للمتفاعل باستخدام user.userId (Firebase UID)
        try {
            await PointsHistory.create({
                userId: user.userId,
                amount: 5,
                source: 'dua_like',
                description: 'تفاعل وإعجاب بدعاء مبارك 🤲'
            });
            console.log("✅ PointsHistory logged for liker:", user.userId);
        } catch (historyErr) {
            console.error("❌ Error saving PointsHistory for liker:", historyErr.message);
        }

        // تحديث الدعاء
        if (!dua.likedBy) dua.likedBy = [];
        dua.likedBy.push(user._id.toString());
        dua.likesCount = (dua.likesCount || 0) + 1;
        await dua.save();

        // منح صاحب الدعاء النقاط (+10 نقاط) وتحديث إحصائياته
        const duaAuthor = await WheelUser.findOne({ userId: dua.userId });
        if (duaAuthor) {
            duaAuthor.totalLikesReceived = (duaAuthor.totalLikesReceived || 0) + 1;
            duaAuthor.points = (duaAuthor.points || 0) + 10;
            await duaAuthor.save();

            // 📝 تسجيل النقاط في PointsHistory للناشر باستخدام duaAuthor.userId
            try {
                await PointsHistory.create({
                    userId: duaAuthor.userId,
                    amount: 10,
                    source: 'dua_like_received',
                    description: 'تلقي إعجاب على دعاء منتشر 🌟'
                });
                console.log("✅ PointsHistory logged for author:", duaAuthor.userId);
            } catch (historyErr) {
                console.error("❌ Error saving PointsHistory for author:", historyErr.message);
            }
        }

        res.json({ success: true, likesCount: dua.likesCount, newPoints: user.points });

    } catch (err) {
        console.error("❌ LIKE DUA ERROR:", err);
        res.status(500).json({ success: false, message: "خطأ داخلي في السيرفر" });
    }
};