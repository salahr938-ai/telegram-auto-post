const DailyQuiz = require("../models/DailyQuiz");
const UserQuizStatus = require("../models/UserQuizStatus");
const WheelUser = require("../models/WheelUser");
const PointsHistory = require("../models/PointsHistory");

// 📝 1. مسار جلب سؤال اليوم بناءً على التاريخ والإعلانات (GET)
exports.getQuestion = async (req, res) => {
    
        try {
            const { userId, questionNumber } = req.query;
    
            if (!userId || !questionNumber) {
                return res.status(400).json({ message: "❌ بيانات ناقصة (userId أو questionNumber مطلوب)" });
            }
    
            const qNum = parseInt(questionNumber);
            const now = Date.now();
          const todayStr = new Date().toLocaleDateString('en-CA', {
        timeZone: 'Asia/Kuwait'
    });
    
            // 1. جلب حالة السؤال الحالية للمستخدم من قاعدة البيانات
            let status = await UserQuizStatus.findOne({ userId, questionNumber: qNum });
    
            // 2. التحقق من قفل الـ 24 ساعة (إذا كان قد حل السؤال وأخذ نقاطه مسبقاً) - تم تحويل الرد إلى JSON
            if (status && status.isAnswered && now < status.availableAtTimestamp) {
                return res.status(200).json({ 
                    isLocked: true, 
                    requiresAd: false,
                    availableAtTimestamp: status.availableAtTimestamp,
                    message: "❌ لقد حصلت على نقاط هذا السؤال سابقاً، انتظر انتهاء مؤقت الـ 24 ساعة!" 
                });
            }
    
            // 3. 🛑 منطق الإعلانات الذكي: تم تحويل الرد إلى JSON نظيف للأندرويد
            if (qNum > 1) {
                if (!status || !status.adWatched) {
                    return res.status(200).json({
                        isLocked: true,
                        requiresAd: true, 
                        message: "❌ هذا السؤال مقفل، يجب مشاهدة إعلان أولاً لفتحه!"
                    });
                }
            }
    
    console.log("todayStr =", todayStr);
    console.log("qNum =", qNum);
            // 4. البحث عن السؤال المجدول في الـ MongoDB
            const foundQ = await DailyQuiz.findOne({ targetDate: todayStr, questionNumber: qNum });
    
            if (!foundQ) {
                return res.status(404).json({ message: "❌ لم يتم جدولة أسئلة لهذا اليوم بعد أو السؤال غير موجود" });
            }
    
            // 5. إرسال السؤال آمن وبدون الإجابة الصحيحة بصيغة JSON
            res.json({
                id: foundQ._id,
                questionNumber: foundQ.questionNumber,
                question: foundQ.question,
                options: foundQ.options,
                points: foundQ.points,
                isLocked: false,
                requiresAd: false
            });
    
        } catch (err) {
            console.error("❌ GET QUIZ QUESTION ERROR:", err);
            res.status(500).json({ message: "❌ خطأ داخلي في السيرفر" });
        }
    };

// 🎬 2. مسار يفتحه الأندرويد بعد مشاهدة الإعلان بنجاح لفتح الأسئلة (POST)


exports.unlockByAd = async (req, res) => { 
  try {
        const { userId, questionNumber } = req.body;
        if (!userId || !questionNumber) {
            return res.status(400).json({ message: "❌ بيانات غير مكتملة" });
        }

        const qNum = parseInt(questionNumber);

        // تسجيل أن المستخدم شاهد الإعلان الخاص بهذا السؤال بنجاح
        await UserQuizStatus.findOneAndUpdate(
            { userId, questionNumber: qNum },
            { $set: { adWatched: true } },
            { upsert: true, new: true }
        );

        res.json({ success: true, message: "تم فتح السؤال بنجاح، يمكنك الانتقال للتحدي الآن! 🎉" });

    } catch (err) {
        console.error("❌ UNLOCK BY AD ERROR:", err);
        res.status(500).json({ message: "❌ خطأ في السيرفر أثناء فتح السؤال" });
    }
};
// 🔐 3. مسار التحقق من صحة الإجابة وتوزيع النقاط وحفظ الهيستوري (POST)
exports.verifyAnswer = async (req, res) => {

    try {
        const { userId, questionId, questionNumber, selectedAnswer } = req.body;

        if (!userId || !questionId || !questionNumber || !selectedAnswer) {
            return res.status(400).json({ message: "❌ بيانات التحقق من الإجابة ناقصة" });
        }

        const qNum = parseInt(questionNumber);

        // جلب السؤال من قاعدة البيانات للتأكد من الإجابة الصحيحة
        const originalQuiz = await DailyQuiz.findById(questionId);
        if (!originalQuiz) {
            return res.status(404).json({ message: "❌ لم يتم العثور على السؤال في السيرفر" });
        }

        const isCorrect = originalQuiz.correctAnswer.trim() === selectedAnswer.trim();

        if (isCorrect) {
            // حساب مؤقت الـ 24 ساعة لسحب السؤال اليومي
            const unlockTime = Date.now() + (24 * 60 * 60 * 1000);

            // تحديث حالة حل السؤال وإعادة قفل حقل الإعلان لليوم القادم لضمان الحماية
            await UserQuizStatus.findOneAndUpdate(
                { userId, questionNumber: qNum },
                { 
                    $set: { 
                        isAnswered: true, 
                        adWatched: false, 
                        availableAtTimestamp: unlockTime 
                    } 
                },
                { upsert: true }
            );

            // شحن النقاط للمستخدم في رصيده الأساسي (WheelUser)
            const account = await WheelUser.findOne({ userId });
            if (account) {
                account.points += originalQuiz.points;
                await account.save();
            }

            // تسجيل العملية في جدول الهيستوري (PointsHistory) لكي تظهر في حساب المستخدم
            await PointsHistory.create({
                userId: userId,
                amount: originalQuiz.points,
                source: "quiz",
                description: `حل تحدي السؤال اليومي رقم ${qNum} بنجاح 🧩`
            });

            return res.json({ isCorrect: true, message: "🎉 إجابة صحيحة مئة بالمئة! تم شحن نقاطك بنجاح." });
        } else {
            // إذا كانت الإجابة خاطئة نرجع النتيجة بدون قفل وبدون نقاط لكي يعيد المحاولة
            return res.json({ isCorrect: false, message: "❌ إجابة خاطئة! ركز جيداً وحاول مجدداً." });
        }

    } catch (err) {
        console.error("❌ VERIFY ANSWER ROUTE ERROR:", err);
        res.status(500).json({ message: "❌ خطأ داخلي في السيرفر أثناء مطابقة الإجابة" });
    }
};
