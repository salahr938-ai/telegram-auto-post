const mongoose = require("mongoose");// // 1️⃣ استدعاء المانغوس (إجباري في كل موديل)
const pointsHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  amount: { type: Number, required: true },
  source: { type: String, required: true }, // 'wheel', 'referral', 'daily_normal', 'daily_double'
  description: { type: String, required: true }, // نص يظهر للمستخدم مثل "مكافأة اليوم الأول مضاعفة"
}, { timestamps: true });

const PointsHistory = mongoose.model("PointsHistory", pointsHistorySchema);