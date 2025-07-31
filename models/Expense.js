const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const expenseSchema = new Schema({
    userId: {
        type: String,
        required: true
    },
    month: {
        type: String,
        required: true
    },
    day: {
        type: Number,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    date: {
        type: String,
        required: true
    }
});

module.exports = mongoose.model('Expense', expenseSchema);