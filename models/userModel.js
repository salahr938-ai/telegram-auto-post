const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    botToken: { type: String, required: true },
    chatId: { type: String, required: true },
    message: { type: String, required: true },
    interval: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);