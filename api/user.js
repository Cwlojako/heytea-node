const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const User = require('../schema/userSchema')
const crypto = require('../utils/crypto')

const SECRET = 'cwlojako'

router.post('/login', async (req, res) => {
	const { username, password } = req.body
	const user = await User.findOne({ username, password })
	if (!user) {
		return res.send({ code: 400, message: '用户名或密码错误' })
	}
	const token = jwt.sign(
		{ 
			id: user._id,
			username: user.username,
			memberLevel: user.memberLevel,
			roles: user.roles
		}, SECRET, { expiresIn: '2h' }
	)
	const result = {
		username, token, memberLevel: user.memberLevel, roles: user.roles
	}
	res.send({
		code: 200,
		message: '登录成功',
		data: crypto.encrypt(JSON.stringify(result))
	})
})

router.get('/checkLogin', (req, res) => {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).send({ code: 401, message: '未登录或Token缺失' })
    }
    const token = auth.split(' ')[1]
    try {
        const user = jwt.verify(token, SECRET)
        res.send({ code: 200, message: '已登录', data: user })
    } catch (err) {
        res.status(401).send({ code: 401, message: 'Token无效或已过期' })
    }
})

module.exports = router