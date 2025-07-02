const mongoose = require('mongoose')
const Schema = mongoose.Schema
const { getCurrentTime } = require('../utils/index')

const tokenSchema = new Schema({
    value: { type: String, required: true },
    phone: { type: String, required: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    createdAt: { 
        type: String,
        default: () => getCurrentTime()
    },
    updatedAt: { type: String }
})

const Token = mongoose.model('Token', tokenSchema)

module.exports = Token