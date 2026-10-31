const mongoose = require('mongoose');

const suggestionSchema = new mongoose.Schema({
    userId: { 
        type: String, 
        required: true, 
        index: true // لتسريع البحث عن اقتراحات المستخدم
    },
    userName: { 
        type: String, 
        default: 'مستخدم' 
    },
    content: { 
        type: String, 
        required: true, 
        trim: true, 
        maxlength: 1000 
    },
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected'], 
        default: 'pending' 

},
    adminReply: { 
        type: String, 
        default: '' // 👈 أضفنا هذا الحقل هنا ليتعرف عليه Mongoose والسيرفر


    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Suggestion', suggestionSchema);