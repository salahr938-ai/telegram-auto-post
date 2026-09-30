// models/AdTransaction.js
// يمنع معالجة نفس معاملة AdMob مرتين (تنتهي الوثائق تلقائياً بعد 7 أيام)
const mongoose = require("mongoose");

const AdTransactionSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 7 * 24 * 60 * 60 },
});

module.exports = mongoose.model("AdTransaction", AdTransactionSchema);
