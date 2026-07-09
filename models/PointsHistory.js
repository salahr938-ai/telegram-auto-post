const mongoose = require("mongoose");

const pointsHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  amount: { type: Number, required: true },
  source: { type: String, required: true },
  description: { type: String, required: true },
}, { timestamps: true });

const PointsHistory = mongoose.model("PointsHistory", pointsHistorySchema);

module.exports = PointsHistory;