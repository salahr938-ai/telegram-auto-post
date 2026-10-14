const mongoose = require('mongoose');

const duaSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'WheelUser', required: true },
    authorName: { type: String, required: true },
    content: { type: String, required: true },
    category: { type: String, default: 'دعاء' },
    likesCount: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'WheelUser' }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Dua', duaSchema);