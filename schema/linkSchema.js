const mongoose = require('mongoose')
const Schema = mongoose.Schema
const { getCurrentTime } = require('../utils/index')

const linkSchema = new Schema({
    uuid: { type: String, required: true },
    phone: { type: String, required: true },
    price: { type: Number, required: true },
    couponId: { type: String, default: null },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
        type: Number,
        enum: [0, 1, 2, 3], // 0: 已关闭, 1: 生效中, 2: 已关闭, 3: 已退款
        default: 1 // 默认值为 1（生效中）
    },
	url: { type: String, default: '' },
	createdAt: { 
		type: String,
		default: () => getCurrentTime()
	},
	orderAt: { type: String }
})
const Link = mongoose.model('Link', linkSchema)

module.exports = Link