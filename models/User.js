const mongoose = require("mongoose");// // 1️⃣ استدعاء المانغوس (إجباري في كل موديل)
// ===================
// 🧩 Model
// ===================
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  botToken: { type: String, required: true },
  chatId: { type: String, required: true },
  message: { type: String, required: true },
  interval: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
