const mongoose = require("mongoose");

const ALLOWED_R2_CATEGORIES = ["ضحك / كوميديا", "قصص", "دروس / شيوخ"];

const r2VideoSchema = new mongoose.Schema(
  {
    ownerId: {
      type: String,
      required: true,
      index: true,
    },
    channelName: {
      type: String,
      default: "قناتي",
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    videoKey: {
      type: String,
      required: true,
    },
    videoUrl: {
      type: String,
      required: true,
    },
    thumbnailKey: {
      type: String,
      default: "",
    },
    thumbnailUrl: {
      type: String,
      default: "",
    },
    width: {
      type: Number,
      default: 0,
    },
    height: {
      type: Number,
      default: 0,
    },
    durationSec: {
      type: Number,
      required: true,
      min: 1,
      max: 180,
    },
    category: {
      type: String,
      required: true,
      enum: ALLOWED_R2_CATEGORIES,
    },
    viewsCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = {
  R2Video: mongoose.model("R2Video", r2VideoSchema),
  ALLOWED_R2_CATEGORIES,
};