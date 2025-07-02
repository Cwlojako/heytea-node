const express = require('express')
const router = express.Router()
const Group = require('../schema/groupSchema')

router.post('/addGroup', async (req, res) => {
    const { name } = req.body
    if (!name) {
        return res.status(400).send({ code: 400, message: '请提供分组名称' })
    }
    try {
        const newGroup = new Group({ name })
        await newGroup.save()
        res.send({ code: 200, message: '分组添加成功', data: newGroup })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

router.post('/editGroup', async (req, res) => {
    const { groupId, name } = req.body
    if (!groupId || !name) {
        return res.status(400).send({ code: 400, message: '请提供分组ID和新的分组名称' })
    }
    try {
        const group = await Group.findById(groupId)
        if (!group) {
            return res.status(404).send({ code: 404, message: '分组不存在' })
        }
        group.name = name
        await group.save()
        res.send({ code: 200, message: '分组名称修改成功', data: group })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

router.get('/getGroups', async (req, res) => {
    try {
        const groups = await Group.find().sort({ createdAt: -1 })
        res.send({ code: 200, message: '获取分组列表成功', data: groups })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

module.exports = router