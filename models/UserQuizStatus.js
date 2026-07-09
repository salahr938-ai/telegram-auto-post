// 1. الاستيراد
const mongoose = require("mongoose");

// 2. تعريف الهيكل (Schema)
const userQuizStatusSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  questionNumber: { type: Number, required: true },
  isAnswered: { type: Boolean, default: false },
  adWatched: { type: Boolean, default: false },
  availableAtTimestamp: { type: Number, default: 0 }
}, { timestamps: true });

// 3. إضافة الـ Index (الآن هو يعرف ما هو userQuizStatusSchema)
userQuizStatusSchema.index({ userId: 1, questionNumber: 1 }, { unique: true });

// 4. التصدير
module.exports = mongoose.model("UserQuizStatus", userQuizStatusSchema);