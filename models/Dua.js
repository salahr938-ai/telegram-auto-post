const mongoose = require('mongoose');

const duaSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'WheelUser', required: true },
    authorName: { type: String, required: true },
    content: { type: String, required: true },
    category: { type: String, default: 'دعاء' },
    likesCount: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'WheelUser' }],
     // فهرس TTL: يحذف MongoDB الوثيقة تلقائيًا بعد المدة من وقت الإنشاء
createdAt: { type: Date, default: Date.now, expires: 21600 }
});

module.exports = mongoose.model('Dua', duaSchema);




