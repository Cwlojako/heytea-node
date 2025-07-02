const express = require('express')
const router = express.Router()
const Link = require('../schema/linkSchema')
const Group = require('../schema/groupSchema')
const Token = require('../schema/tokenSchema')
const crypto = require('../utils/crypto')

async function createLink({ uuid, phone, price, couponId, url }) {
    const newLink = new Link({
        uuid,
        phone,
        price,
        couponId: couponId || null,
        url
    })
    await newLink.save()
    return newLink
}

router.post('/generateLink', async (req, res) => {
    const { uuid, phone, price, couponId, url } = req.body
    if (!uuid || !phone || !price) {
        return res.status(400).send({ code: 400, message: '请提供 uuid, phone 和 price 参数' })
    }
    try {
        const newLink = await createLink({ uuid, phone, price, couponId, url })
        res.send({ code: 200, message: '链接生成成功', data: newLink })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message });
    }
})

router.post('/generateLinksBatch', async (req, res) => {
    const { uuids, phone, price, couponIds, urls } = req.body
    if (!Array.isArray(uuids) || !uuids.length || !phone || !price) {
        return res.status(400).send({ code: 400, message: '请提供正确参数' })
    }
    try {
        const links = []
        for (let i = 0; i < uuids.length; i++) {
            const link = await createLink({ 
                uuid: uuids[i],
                phone,
                price,
                couponId: couponIds[i] || null,
                url: urls[i]
            })
            links.push(link)
        }
        res.send({ code: 200, message: '链接批量生成成功', data: links })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message });
    }
})

router.post('/closeOrOpenLink', async (req, res) => {
    const { uuids, close = true } = req.body
    if (!Array.isArray(uuids) || uuids.length === 0) {
        return res.status(400).send({ code: 400, message: '请提供非空的 uuids 数组参数' })
    }
    try {
        const result = await Link.updateMany(
            { uuid: { $in: uuids } },
            { status: close ? 0 : 1, couponId: null }
        )
        if (result.matchedCount === 0) {
            return res.status(404).send({ code: 404, message: '未找到匹配的链接' })
        }
        res.send({ code: 200, message: '链接批量关闭成功', data: result })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

router.get('/isLinkClosed', async (req, res) => {
    const { uuid } = req.query
    if (!uuid) {
        return res.status(400).send({ code: 400, message: '请提供 uuid 参数' })
    }
    try {
        const link = await Link.findOne({ uuid })
        res.send({ code: 200, message: '查询成功', data: +link.status === 0 })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

router.post('/batchDelLink', async (req, res) => {
    try {
        const { ids } = req.body
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).send({ message: '请提供要删除的ID数组' })
        }
        const result = await Link.deleteMany({ _id: { $in: ids } })
        res.send({ code: 200, message: '批量删除成功', data: result.deletedCount })
    } catch (error) {
        res.status(500).send({ message: '服务器错误', error: error.message })
    }
})

router.get('/getLinkDetails', async (req, res) => {
    const { uuid } = req.query
    if (!uuid) {
        return res.status(400).send({ code: 400, message: '请提供 uuid 参数' })
    }
    try {
        const link = await Link.findOne({ uuid }, { phone: 1, price: 1, _id: 0 })
        if (!link) {
            return res.status(404).send({ code: 404, message: '未找到对应的链接' })
        }
        res.send({ 
            code: 200,
            message: '查询成功',
            data: {
                price: crypto.encrypt(link.price),
                phone: crypto.encrypt(link.phone)
            }
        })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

router.post('/getLinks', async (req, res) => {
    let { page = 1, size = 10, uuid, phone, status, date, price } = req.body
    page = parseInt(page)
    size = parseInt(size)

    let startDate = ''
    let endDate = ''

    if (date && date.length) {
        const [ s, e ] = date
        startDate = s
        endDate = e
    }
    const filter = {}
    if (uuid) {
        filter.uuid = uuid
    }
    if (String(status)) {
        filter.status = status
    }
    if (phone) {
        filter.phone = { $regex: phone, $options: 'i' }
    }
    if (price) {
        filter.price = price
    }
    if (startDate && endDate) {
        filter.createdAt = { $gte: startDate, $lte: endDate }
    }
    try {
        const total = await Link.countDocuments(filter)
        const links = await Link.find(filter)
            .skip((page - 1) * size)
            .limit(size)
            .sort({ createdAt: -1 })

        const result = await Promise.all(links.map(async link => {
            let groupName = ''
            const t = await Token.findOne({ phone: link.phone })
            if (t.groupId) {
                const group = await Group.findById(t.groupId)
                groupName = group ? group.name : ''
            }
            return {
                ...link.toObject(),
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

router.post('/refund', async (req, res) => {
	const { uuid } = req.body
	if (!uuid) {
        return res.status(400).send({ code: 400, message: '请提供uuid' })
    }
	try {
		const link = await Link.findOne({ uuid })
		let url = link.url
		url = url.replace(/&c=[^&]*/g, '')
		await Link.updateOne({ uuid }, { $set: { status: 3, url, couponId: null } })
		res.send({ code: 200, message: '退款成功' })
	} catch (error) {
		res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
	}
})

module.exports = router