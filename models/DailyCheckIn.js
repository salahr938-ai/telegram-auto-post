const mongoose = require("mongoose");

const dailyCheckInSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  lastCheckInTime: { type: Date, default: null },
  streakDays: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("DailyCheckIn", dailyCheckInSchema);