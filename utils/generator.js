// utils/generator.js
function generateReferralCode(userId) {
    return userId.substring(0, 6).toUpperCase() + Math.floor(1000 + Math.random() * 9000);
}

module.exports = { generateReferralCode };