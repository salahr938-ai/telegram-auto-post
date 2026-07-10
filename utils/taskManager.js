// ملف: utils/taskManager.js
const mongoose = require("mongoose");

const tasks = new Map();
let isDbConnected = false;

mongoose.connection.on("connected", () => { isDbConnected = true; });
mongoose.connection.on("disconnected", () => { isDbConnected = false; });

// أضف هذه الدالة هنا
function startTask(user) {
    console.log(`🚀 Starting task for user: ${user.userId}`);
    // ضع منطق المهمة الخاصة بك هنا (مثلاً: تعيين مؤقتات أو ريست للنقاط)
}

// قم بتصديرها مع البقية
module.exports = { tasks, isDbConnected, startTask };