const WheelUser = require('../models/WheelUser'); // استدعاء الموديل المحدث الخاص بك
const Dua = require('../models/duaModel');
const PointsHistory = require('../models/PointsHistory');

// دالة لجلب أو إنشاء مستخدم الأدعية من جدول WheelUser باستخدام الـ uid القادم من التوكن
async function getOrCreateDuaUser(decodedToken) {
    let user = await WheelUser.findOne({ userId: decodedToken.uid });
    if (!user) {
        user = new WheelUser({
            userId: decodedToken.uid,
            name: decodedToken.name || decodedToken.email || 'مستخدم جديد'
        });
        await user.save();
    }
    return user;
}

// 1. مسار نشر دعاء جديد (يتطلب مشاهدة إعلان مكافأة في التطبيق أولاً)
exports.publishDua = async (req, res) => {
    try {
        const { content, category } = req.body;
        const user = await getOrCreateDuaUser(req.user);

        // فحص مهلة الـ 6 ساعات بين كل منشور وآخر
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

        // إنشاء الدعاء الجديد
        const newDua = new Dua({
            userId: user._id,
            authorName: user.name || 'مستخدم',
            content,
            category: category || 'دعاء'
        });
        await newDua.save();

        // تحديث وقت آخر نشر وإجمالي الأدعية
        user.lastPostDate = new Date();
        user.totalDuasPublished = (user.totalDuasPublished || 0) + 1;
        await user.save();

        res.status(200).json({ success: true, message: 'تم نشر الدعاء بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. مسار الإعجاب بدعاء (مع تقييد إعجابين كل ساعة + منح 5 نقاط للمتفاعل + الحذف المبكر)
exports.likeDua = async (req, res) => {
    try {
        const { duaId } = req.body;
        const user = await getOrCreateDuaUser(req.user); // المستخدم المتفاعل
        const dua = await Dua.findById(duaId);

        if (!dua) {
            return res.status(404).json({ success: false, message: 'الدعاء غير موجود' });
        }

        // منع المستخدم من الإعجاب بدعائه الشخصي
        if (dua.userId.toString() === user._id.toString()) {
            return res.status(400).json({ success: false, message: 'لا يمكنك الإعجاب بدعائك الخاص' });
        }

        // فحص حصة الإعجابات الساعية (إعجابين كل ساعة)
        const now = new Date();
        const lastReset = user.lastLikeResetTime ? new Date(user.lastLikeResetTime) : now;
        const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60);

        if (hoursSinceReset >= 1) {
            user.likesGivenThisHour = 0;
            user.lastLikeResetTime = now;
        }

        if ((user.likesGivenThisHour || 0) >= 2) {
            return res.status(400).json({ 
                success: false, 
                message: 'لقد استنفدت حصتك من الإعجابات (إعجابين كل ساعة). انتظر قليلاً.' 
            });
        }

        // فحص الإعجاب السابق
        if (dua.likedBy.includes(user._id)) {
            return res.status(400).json({ success: false, message: 'لقد أعجبت بهذا الدعاء مسبقاً' });
        }

        // 1. تحديث بيانات المتفاعل ومنحه 5 نقاط
        user.likesGivenThisHour = (user.likesGivenThisHour || 0) + 1;
        user.points = (user.points || 0) + 5; 
        await user.save();

        // 📝 تسجيل النقاط للمتفاعل في PointsHistory (مطابق تماماً للـ Schema)
        await PointsHistory.create({
            userId: user._id.toString(),
            amount: 5,
            source: 'dua_like',
            description: 'تفاعل وإعجاب بدعاء مبارك 🤲'
        });

        // 2. تحديث إحصائيات الدعاء
        dua.likedBy.push(user._id);
        dua.likesCount += 1;
        await dua.save();

        // 3. تحديث بيانات الناشر ومنحه 10 نقاط
        const duaAuthor = await WheelUser.findById(dua.userId);
        if (duaAuthor) {
            duaAuthor.totalLikesReceived = (duaAuthor.totalLikesReceived || 0) + 1;
            duaAuthor.points = (duaAuthor.points || 0) + 10;
            await duaAuthor.save();

            // 📝 تسجيل النقاط للناشر في PointsHistory
            await PointsHistory.create({
                userId: duaAuthor._id.toString(),
                amount: 10,
                source: 'dua_like_received',
                description: 'تلقي إعجاب على دعاء منتشر 🌟'
            });
        }

        // شرط الحذف المبكر عند الوصول لـ 8 إعجابات
        const TARGET_LIKES_FOR_EARLY_DELETE = 8;
        let isDeletedEarly = false;

        if (dua.likesCount >= TARGET_LIKES_FOR_EARLY_DELETE) {
            await Dua.findByIdAndDelete(duaId);
            isDeletedEarly = true;
        }

        res.status(200).json({ 
            success: true, 
            message: 'تم تسجيل الإعجاب بنجاح وحصلت على 5 نقاط',
            pointsEarned: 5,
            currentLikes: dua.likesCount,
            isDeletedEarly
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3. مسار جلب الأدعية النشطة
exports.getDuasFeed = async (req, res) => {
    try {
        const duas = await Dua.find()
            .sort({ createdAt: -1 })
            .select('-likedBy');

        res.status(200).json({ success: true, duas });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};