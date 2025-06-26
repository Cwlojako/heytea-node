const CryptoJS = require('crypto-js')

const secretKey = 'cwlojako'

function encrypt(text) {
    if (typeof text === 'number') {
        text = String(text)
    }
    return CryptoJS.AES.encrypt(text, secretKey).toString()
}

function decrypt(text) {
    const bytes = CryptoJS.AES.decrypt(text, secretKey)
    return bytes.toString(CryptoJS.enc.Utf8)
}

module.exports = {
    encrypt,
    decrypt
}