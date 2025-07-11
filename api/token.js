const express = require('express')
const router = express.Router()
const { getCurrentTime, getUser } = require('../utils/index')
const Token = require('../schema/tokenSchema')
const Group = require('../schema/groupSchema')

//更新或新增Token
router.post('/setOrUpdateToken', async (req, res) => {
	const { token, phone, groupId = null } = req.body
    const authHeader = req.headers['authorization']
	if (!token || !phone) {
		res.send({ code: 400, message: '请提供token 和 phone参数' })
		return
	}
	try {
		const existingToken = await Token.findOne({ phone })
		if (existingToken) {
            existingToken.value = token
			groupId && (existingToken.groupId = groupId)
			const formattedTime = getCurrentTime()
            existingToken.updatedAt = formattedTime
            await existingToken.save()
        } else {
            const user = await getUser(authHeader)
            const newToken = new Token({ value: token, phone, groupId, ownerId: user._id })
            await newToken.save()
        }
        res.send({ code: 200, message: '设置成功' })
	} catch (error) {
		res.status(500).send({ code: 500, message: '服务器错误' })
	}
})

// 获取Token列表
router.get('/getAllTokens', async (req, res) => {
    const authHeader = req.headers['authorization']
    try {
        const user = await getUser(authHeader)
        const filter = {}
        if (!user.roles.includes('Admin') && !user.roles.includes('Developer')) {
            filter.ownerId = user._id
        }
        const tokens = await Token.find(filter)
        res.send({ code: 200, message: '获取成功', data: tokens })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误' })
    }
})

// 获取分页的Token列表
router.post('/getTokens', async (req, res) => {
    let { page = 1, size = 10, phone } = req.body
    const authHeader = req.headers['authorization']
    const user = await getUser(authHeader)
    page = parseInt(page)
    size = parseInt(size)
    const filter = {}
    if (!user.roles.includes('Admin') && !user.roles.includes('Developer')) {
        filter.ownerId = user._id
    }
    if (phone) {
        filter.phone = { $regex: phone, $options: 'i' }
    }
    try {
        const total = await Token.countDocuments(filter)
        const tokens = await Token.find(filter)
            .skip((page - 1) * size)
            .limit(size)
            .sort({ createdAt: -1 })

        const result = await Promise.all(tokens.map(async token => {
            let groupName = ''
            if (token.groupId) {
                const group = await Group.findById(token.groupId)
                groupName = group ? group.name : ''
            }
            return {
                ...token.toObject(),
                groupName
            }
        }))

        res.send({
            code: 200,
            message: '获取成功',
            data: {
                total,
                page,
                size,
                list: result
            }
        })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

// 删除Token
router.post('/deleteTokens', async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).send({ code: 400, message: '请提供非空的 ids 数组参数' })
    }

    try {
        const result = await Token.deleteMany({ _id: { $in: ids } })
        if (result.deletedCount === 0) {
            return res.status(404).send({ code: 404, message: '未找到匹配的 Token' })
        }
        res.send({ code: 200, message: '删除成功', data: result })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

module.exports = router