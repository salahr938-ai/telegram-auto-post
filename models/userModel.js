const mongoose = require('mongoose');

const duaSchema = new mongoose.Schema({
    // تم التعديل هنا ليرتبط بـ WheelUser بدلاً من User
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'WheelUser', required: true },
    authorName: { type: String, required: true },
    category: { type: String, default: 'دعاء' },
    content: { type: String, required: true },
    likesCount: { type: Number, default: 0 },
    // وهنا أيضاً لكي يتوافق مع أيدي المستخدمين في العجلة
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'WheelUser' }],
    createdAt: { type: Date, default: Date.now, expires: '6h' } // TTL Index كحماية احتياطية لحذف الدعاء بعد 6 ساعات
});

module.exports = mongoose.model('Dua', duaSchema);