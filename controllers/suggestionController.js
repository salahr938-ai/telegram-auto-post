const Suggestion = require('../models/suggestionModel');
const User = require('../models/userModel'); // افترض أن لديك نموذج المستخدمين لحفظ النقاط
const PointsHistory = require("../models/PointsHistory");
// مدة الانتظار: 3 أيام بالمللي ثانية (72 ساعة)
const COOLDOWN_PERIOD = 3 * 24 * 60 * 60 * 1000;

exports.createSuggestion = async (req, res) => {
    try {
        const userId = req.user.uid; 
        const { content } = req.body;

        if (!content || content.trim() === '') {
            return res.status(400).json({ success: false, message: 'محتوى الاقتراح فارغ.' });
        }

        // التحقق من مدة الانتظار (Cooldown 3 أيام)
        const lastSuggestion = await Suggestion.findOne({ userId }).sort({ createdAt: -1 });
        if (lastSuggestion) {
            const elapsed = Date.now() - new Date(lastSuggestion.createdAt).getTime();
            const COOLDOWN_PERIOD = 3 * 24 * 60 * 60 * 1000;
            if (elapsed < COOLDOWN_PERIOD) {
                const remainingHours = Math.ceil((COOLDOWN_PERIOD - elapsed) / (1000 * 60 * 60));
                return res.status(400).json({ 
                    success: false, 
                    message: `عليك الانتظار لمدة ${remainingHours} ساعة أخرى لتقديم اقتراح جديد.` 
                });
            }
        }

        // حفظ الاقتراح بحالة pending
        const newSuggestion = await Suggestion.create({
            userId,
            userName: req.user.name || 'مستخدم',
            content,
            status: 'pending'
        });

        // 🎁 منح الـ 20 نقطة الأساسية فوراً
        const BASE_POINTS = 20;
        await User.findOneAndUpdate(
            { userId: userId },
            { $inc: { points: BASE_POINTS } },
            { new: true }
        );
// 📝 تسجيل العملية في السجل
await PointsHistory.create({
    userId: userId,
    amount: BASE_POINTS,
    source: 'suggestion',
    description: 'مكافأة إرسال اقتراح تحسين للتطبيق',
    createdAt: new Date()
});
        res.status(201).json({
            success: true,
            message: 'تم إرسال اقتراحك بنجاح وحصلت على 20 نقطة!',
            suggestionId: newSuggestion._id,
            earnedPoints: BASE_POINTS
        });

    } catch (error) {
        console.error('Error in createSuggestion:', error);
        res.status(500).json({ success: false, message: 'خطأ في الخادم.' });
    }
};

exports.claimAdBonus = async (req, res) => {
    try {
        const userId = req.user.uid;

        // 🎁 إضافة الـ 60 نقطة الإضافية بعد مشاهدة الإعلان
        const BONUS_POINTS = 60; 
        await User.findOneAndUpdate(
            { userId: userId },
            { $inc: { points: BONUS_POINTS } },
            { new: true }
        );
        // 📝 تسجيل العملية في السجل
await PointsHistory.create({
    userId: userId,
    amount: BONUS_POINTS,
    source: 'suggestion_ad',
    description: 'مكافأة مشاهدة إعلان الاقتراح',
    createdAt: new Date()
});

        res.status(200).json({
            success: true,
            message: 'مبروك! شاهدت الإعلان وحصلت على 60 نقطة إضافية.'
        });

    } catch (error) {
        console.error('Error in claimAdBonus:', error);
        res.status(500).json({ success: false, message: 'خطأ في الخادم.' });
    }
};