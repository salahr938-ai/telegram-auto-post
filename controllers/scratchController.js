// غيّر السطر الأول ليكون:
const WheelUser = require('../models/WheelUser'); 

// غيّر السطر الثاني ليكون:
const PointsHistory = require('../models/PointsHistory');

exports.claimScratch = async (req, res) => {
    try {
        const { userId, amount } = req.body;

        // 1. ابحث عن المستخدم أولاً دون تعديل أي شيء
        const user = await WheelUser.findOne({ userId: userId });
        if (!user) return res.status(404).json({ message: "مستخدم غير موجود" });

        // 2. تحقق من الوقت الآن
        const now = new Date();
        const lastScratch = user.lastScratchAt || new Date(0); 
        const diffInHours = (now - lastScratch) / (1000 * 60 * 60);

        if (diffInHours < 24) {
            return res.status(403).json({ 
                message: "عذراً، يجب انتظار 24 ساعة للعملية القادمة",
                remainingHours: (24 - diffInHours).toFixed(1) 
            });
        }

        // 3. إذا مر الوقت، نقوم بتحديث النقاط وتحديث وقت الكشط
        user.points += amount;
        user.lastScratchAt = now; 
        await user.save();

        // 4. تسجيل التاريخ
        await PointsHistory.create({
            userId: userId,
            amount: amount,
            source: 'scratch',
            description: 'جائزة بطاقة الكشط اليومية',
            createdAt: now
        });

        res.status(200).json({ success: true, points: user.points });
    } catch (error) {
        res.status(500).json({ message: "خطأ في السيرفر", error: error.message });
    }
};
// 2. دالة جلب الحالة (تُستخدم لإظهار العداد التنازلي في التطبيق)
exports.getScratchStatus = async (req, res) => {
    try {
        const user = await WheelUser.findOne({ userId: req.params.userId });
        if (!user) return res.status(404).json({ message: "مستخدم غير موجود" });

        const now = new Date();
        const lastScratch = user.lastScratchAt || new Date(0);
        const diff = now.getTime() - lastScratch.getTime();
        const twentyFourHours = 24 * 60 * 60 * 1000;

        // استخدم adsLeft الموجودة في الموديل مباشرة
        const adsLeft = user.adsLeft !== undefined ? user.adsLeft : 5;

        const canScratch = diff >= twentyFourHours;

        res.json({ 
            canScratch: canScratch, 
            remainingTimeMs: canScratch ? 0 : twentyFourHours - diff, 
            points: user.points,
            adsLeft: adsLeft 
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.resetScratchTime = async (req, res) => {
    try {
        const { userId } = req.body;
        // نضبط وقت الكشط ليكون قديم جداً (مما يسمح بالكشط فوراً)
        await WheelUser.findOneAndUpdate(
            { userId: userId },
            { lastScratchAt: new Date(0) }
        );
        res.json({ success: true, message: "تم تصفير الوقت، يمكنك الكشط الآن!" });
    } catch (error) {
        res.status(500).json({ message: "خطأ في السيرفر" });
    }
};

exports.watchAd = async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await WheelUser.findOne({ userId: userId });
        
        if (!user) return res.status(404).json({ message: "مستخدم غير موجود" });
        
        // التحقق من أن المستخدم لديه فرص
        if (user.adsLeft <= 0) {
            return res.status(403).json({ message: "لقد وصلت للحد الأقصى للإعلانات اليوم!" });
        }

        // خصم فرصة واحدة
        user.adsLeft -= 1;
        // زيادة فرص التدوير أو الكشط (مثلاً إضافة 1)
        // إذا كان هذا للإعلانات الخاصة بالكشط، تأكد من منطقك
        await user.save();

        res.json({ success: true, adsLeft: user.adsLeft });
    } catch (error) {
        res.status(500).json({ message: "خطأ في السيرفر" });
    }
};