const mongoose = require("mongoose");

const contestSchema = new mongoose.Schema({
    contestNumber: { type: Number, default: 1 },
    participantsCount: { type: Number, default: 0 },
    maxParticipants: { type: Number, default: 500 },
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    winners: [
        {
            userId: String,
            maskedName: String, // لعرض اسم مخفي بأمان مثل A***r
            prize: { type: String, default: "3$" },
            wonAt: { type: Date, default: Date.now }
        }
    ],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Contest", contestSchema);