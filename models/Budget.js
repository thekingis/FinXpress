const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const budgetSchema = new Schema({
    userId: {
        type: String,
        required: true
    },
    month: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    categories: {
        type: Object,
        required: true
    },
    income: {
        type: Number,
        required: true
    },
    date: {
        type: String,
        required: true
    }
});

module.exports = mongoose.model('Budget', budgetSchema);