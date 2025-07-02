const mongoose = require('mongoose')
const Schema = mongoose.Schema
const { getCurrentTime } = require('../utils/index')

const groupSchema = new Schema({
    name: { type: String, required: true },
    createdAt: { 
        type: String,
        default: () => getCurrentTime()
    }
})
const Group = mongoose.model('Group', groupSchema)

module.exports = Group