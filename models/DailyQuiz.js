// 📅 كود نظام الأسئلة اليومية المجدولة والإعلانات (Quiz System)
const mongoose = require("mongoose");// // 1️⃣ استدعاء المانغوس (إجباري في كل موديل)
const dailyQuizSchema = new mongoose.Schema({
  targetDate: { type: String, required: true },       // التاريخ بصيغة YYYY-MM-DD
  questionNumber: { type: Number, required: true },   // رقم السؤال من 1 إلى 5
  question: { type: String, required: true },         // نص السؤال
  options: { type: [String], required: true },        // الخيارات الأربعة
  correctAnswer: { type: String, required: true },    // الإجابة الصحيحة
  points: { type: Number, required: true }            // النقاط الممنوحة عند الحل الصحيح
}, { timestamps: true });

module.exports = mongoose.model("DailyQuiz", dailyQuizSchema, "daily_quizzes");