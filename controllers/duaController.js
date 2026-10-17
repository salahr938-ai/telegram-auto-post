const mongoose = require('mongoose');
const { getFirestore } = require('firebase-admin/firestore');
const WheelUser = require('../models/WheelUser');
const Dua = require('../models/Dua');
const PointsHistory = require('../models/PointsHistory');

const POST_COOLDOWN_HOURS = 6;
const MAX_CONTENT_LENGTH = 500;
const DUA_LIFETIME_HOURS = 6;
const MAX_LIKES_PER_HOUR = 2;
const TARGET_LIKES_FOR_EARLY_DELETE = 8;
const LIKER_POINTS = 5;
const AUTHOR_POINTS = 10;
const HOUR_MS = 60 * 60 * 1000;

async function getOrCreateDuaUser(decodedToken) {
    let user = await WheelUser.findOne({ userId: decodedToken.uid });
    if (!user) {
        user = await WheelUser.create({
            userId: decodedToken.uid,
            name: decodedToken.name || decodedToken.email || 'مستخدم جديد'
        });
    }
    return user;
}

async function getNickname(uid) {
    try {
        const snap = await getFirestore().collection('users').doc(uid).get();
        const name = snap.exists ? snap.get('name') : null;
        console.log('NICKNAME DEBUG:', uid, '| docExists:', snap.exists, '| name:', name);
        return typeof name === 'string' && name.trim() ? name.trim() : null;
    } catch (err) {
        console.error('❌ getNickname error:', err.message);
        return null;
    }
}

function computeLikeQuota(user) {
    const now = Date.now();
    const windowStart = user && user.lastLikeResetTime ? new Date(user.lastLikeResetTime).getTime() : 0;
    const windowActive = windowStart > 0 && now - windowStart < HOUR_MS;
    const used = windowActive ? (user.likesGivenThisHour || 0) : 0;
    const remaining = Math.max(0, MAX_LIKES_PER_HOUR - used);
    return {
        likesRemaining: remaining,
        likesResetInMs: windowActive && remaining === 0 ? windowStart + HOUR_MS - now : 0
    };
}

async function logPoints(firebaseUid, amount, source, description) {
    try {
        await PointsHistory.create({ userId: firebaseUid, amount, source, description });
    } catch (err) {
        console.error('❌ PointsHistory error:', err.message);
    }
}

// ===================================
// 1. نشر دعاء جديد
// ===================================
exports.publishDua = async (req, res) => {
    try {
        const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
        const category = typeof req.body.category === 'string' ? req.body.category.trim() : '';

        if (!content) {
            return res.status(400).json({ success: false, message: 'محتوى الدعاء مطلوب' });
        }
        if (content.length > MAX_CONTENT_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `الدعاء طويل جدًا (الحد الأقصى ${MAX_CONTENT_LENGTH} حرف)`
            });
        }

        const user = await getOrCreateDuaUser(req.user);

        // 🛑 التحقق من التوثيق
        if (!user.isVerified) {
            return res.status(403).json({
                success: false,
                message: 'حسابك غير موثق. يرجى التواصل معنا عبر واتساب أو تيليجرام لتوثيق الحساب.'
            });
        }

        const now = new Date();
        const cooldownLimit = new Date(now.getTime() - POST_COOLDOWN_HOURS * HOUR_MS);

        const reserved = await WheelUser.findOneAndUpdate(
            {
                _id: user._id,
                $or: [{ lastPostDate: null }, { lastPostDate: { $exists: false } }, { lastPostDate: {$lte: cooldownLimit } }]
            },
            { $set: { lastPostDate: now },$inc: { totalDuasPublished: 1 } },
            { new: false }
        );

        if (!reserved) {
            const hoursSince = (Date.now() - new Date(user.lastPostDate).getTime()) / HOUR_MS;
            const remaining = Math.max(0, POST_COOLDOWN_HOURS - hoursSince).toFixed(1);
            return res.status(400).json({
                success: false,
                message: `يجب عليك الانتظار لمدة ${remaining} ساعات لنشر دعاء جديد.`
            });
        }

        try {
            const nickname = await getNickname(req.user.uid);
            await Dua.create({
                userId: user._id,
                authorName: nickname || user.name || 'مستخدم',
                content,
                category: category || 'دعاء'
            });
        } catch (createErr) {
            await WheelUser.updateOne(
                { _id: user._id },
                { $set: { lastPostDate: reserved.lastPostDate \vert{}\vert{} null },$inc: { totalDuasPublished: -1 } }
            );
            throw createErr;
        }

        res.status(200).json({ success: true, message: 'تم نشر الدعاء بنجاح' });
    } catch (error) {
        console.error('❌ PUBLISH DUA ERROR:', error);
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
};

// ===================================
// 2. الإعجاب بدعاء
// ===================================
exports.likeDua = async (req, res) => {
    try {
        const { duaId } = req.body;
        if (!duaId || !mongoose.isValidObjectId(duaId)) {
            return res.status(400).json({ success: false, message: 'معرف الدعاء غير صالح' });
        }

        const user = await getOrCreateDuaUser(req.user);

        // 🛑 التحقق من التوثيق
        if (!user.isVerified) {
            return res.status(403).json({
                success: false,
                message: 'حسابك غير موثق. يرجى التواصل معنا عبر واتساب أو تيليجرام لتوثيق الحساب.'
            });
        }

        const dua = await Dua.findById(duaId);
        const expired = dua && Date.now() - new Date(dua.createdAt).getTime() > DUA_LIFETIME_HOURS * HOUR_MS;
        if (!dua || expired) {
            return res.status(404).json({ success: false, message: 'الدعاء غير موجود أو انتهت مدته' });
        }

        if (dua.userId.toString() === user._id.toString()) {
            return res.status(400).json({ success: false, message: 'لا يمكنك الإعجاب بدعائك الخاص' });
        }

        const now = new Date();
        const hourAgo = new Date(now.getTime() - HOUR_MS);

        await WheelUser.updateOne(
            {
                _id: user._id,
                $or: [
                    { lastLikeResetTime: null },
                    { lastLikeResetTime: { $exists: false } },
                    { lastLikeResetTime: { $lte: hourAgo } }
                ]
            },
            { $set: { likesGivenThisHour: 0, lastLikeResetTime: now } }
        );

        const quota = await WheelUser.findOneAndUpdate(
            {
                _id: user._id,
                $or: [
                    { likesGivenThisHour: { $lt: MAX_LIKES_PER_HOUR } },
                    { likesGivenThisHour: { $exists: false } }
                ]
            },
            { $inc: { likesGivenThisHour: 1 } },
            { new: true }
        );

        if (!quota) {
            return res.status(400).json({
                success: false,
                message: `لقد استنفدت حصتك من الإعجابات (${MAX_LIKES_PER_HOUR} كل ساعة). انتظر قليلاً.`
            });
        }

        const updatedDua = await Dua.findOneAndUpdate(
            { _id: duaId, likedBy: { $ne: user._id } },
            { $addToSet: { likedBy: user._id },$inc: { likesCount: 1 } },
            { new: true }
        );

        if (!updatedDua) {
            await WheelUser.updateOne({ _id: user._id }, { $inc: { likesGivenThisHour: -1 } });
            return res.status(400).json({ success: false, message: 'لقد أعجبت بهذا الدعاء مسبقاً' });
        }

        const liker = await WheelUser.findByIdAndUpdate(
            user._id,
            { $inc: { points: LIKER_POINTS } },
            { new: true }
        );
        await logPoints(user.userId, LIKER_POINTS, 'dua_like', 'تفاعل وإعجاب بدعاء مبارك 🤲');

        const author = await WheelUser.findByIdAndUpdate(
            dua.userId,
            { $inc: { totalLikesReceived: 1, points: AUTHOR_POINTS } },
            { new: true }
        );
        if (author) {
            await logPoints(author.userId, AUTHOR_POINTS, 'dua_like_received', 'تلقي إعجاب على دعاء منتشر 🌟');
        }

        let isDeletedEarly = false;
        if (updatedDua.likesCount >= TARGET_LIKES_FOR_EARLY_DELETE) {
            await Dua.deleteOne({ _id: duaId });
            isDeletedEarly = true;
        }

        res.status(200).json({
            success: true,
            message: 'تم تسجيل الإعجاب بنجاح وحصلت على 5 نقاط',
            pointsEarned: LIKER_POINTS,
            newPoints: liker ? liker.points : undefined,
            currentLikes: updatedDua.likesCount,
            isDeletedEarly
        });
    } catch (error) {
        console.error('❌ LIKE DUA ERROR:', error);
        res.status(500).json({ success: false, message: 'خطأ داخلي في السيرفر' });
    }
};

// ===================================
// 3. جلب الأدعية النشطة
// ===================================
exports.getDuasFeed = async (req, res) => {
    try {
        let myId = null;
        let me = null;
        if (req.user && req.user.uid) {
            me = await WheelUser.findOne({ userId: req.user.uid })
                .select('_id likesGivenThisHour lastLikeResetTime isVerified');
            myId = me ? me._id.toString() : null;
        }

        const oldestAllowed = new Date(Date.now() - DUA_LIFETIME_HOURS * HOUR_MS);
        const duas = await Dua.find({ createdAt: { $gt: oldestAllowed } })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        const result = duas.map(({ likedBy, ...rest }) => ({
            ...rest,
            likedByMe: myId ? (likedBy || []).some((id) => id.toString() === myId) : false
        }));

        res.status(200).json({
            success: true,
            duas: result,
            isVerified: me ? (me.isVerified || false) : false,
            ...computeLikeQuota(me)
        });
    } catch (error) {
        console.error('❌ GET DUAS FEED ERROR:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
};