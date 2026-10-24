const Suggestion = require('../models/suggestionModel');
const User = require('../models/userModel'); // افترض أن لديك نموذج المستخدمين لحفظ النقاط

// مدة الانتظار: 3 أيام بالمللي ثانية (72 ساعة)
const COOLDOWN_PERIOD = 3 * 24 * 60 * 60 * 1000;

exports.createSuggestion = async (req, res) => {
    try {
        // الـ userId يأتي من مmiddleware التحقق من توكن Firebase
        const userId = req.user.uid; 
        const { content } = req.body;

        if (!content || content.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                message: 'محتوى الاقتراح لا يمكن أن يكون فارغاً.' 
            });
        }

        // 1️⃣ التحقق من آخر اقتراح أرسله هذا المستخدم
        const lastSuggestion = await Suggestion.findOne({ userId }).sort({ createdAt: -1 });

        if (lastSuggestion) {
            const elapsed = Date.now() - new Date(lastSuggestion.createdAt).getTime();
            
            if (elapsed < COOLDOWN_PERIOD) {
                const remainingMs = COOLDOWN_PERIOD - elapsed;
                const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
                
                return res.status(400).json({
                    success: false,
                    message: `عليك الانتظار لمدة ${remainingHours} ساعة أخرى لتقديم اقتراح جديد.`
                });
            }
        }

        // 2️⃣ حفظ الاقتراح الجديد في قاعدة البيانات
        const newSuggestion = await Suggestion.create({
            userId,
            userName: req.user.name || 'مستخدم',
            content
        });

        // 3️⃣ إضافة النقاط للمستخدم (مثلاً 40 نقطة أساسية)
        const REWARD_POINTS = 40;
        await User.findOneAndUpdate(
            { firebaseUid: userId }, // أو المعرّف حسب تصميم جدول المستخدمين لديك (_id أو firebaseUid)
            { $inc: { points: REWARD_POINTS } },
            { new: true }
        );

        res.status(201).json({
            success: true,
            message: 'تم إرسال اقتراحك بنجاح وحصلت على نقاط المكافأة!',
            earnedPoints: REWARD_POINTS,
            suggestion: newSuggestion
        });

    } catch (error) {
        console.error('Error in createSuggestion:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ في الخادم، يجدر المحاولة لاحقاً.' 
        });
    }
};