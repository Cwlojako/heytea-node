const mongoose = require('mongoose')
const Schema = mongoose.Schema

const userSchema = Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    memberLevel: { type: String, required: true }, // 会员等级
    roles: [{ type: String }] // 角色数组
})

const User = mongoose.model('User', userSchema)

module.exports = User