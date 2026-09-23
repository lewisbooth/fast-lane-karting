// Takes the fastest lap out of a Google Spreadsheet
// and updates the source snapshot for the next deterministic site build.
const fs = require('fs')
const path = require('path')
const { GoogleSpreadsheet } = require('google-spreadsheet')
require('dotenv').config({ path: path.join(__dirname, '../.env') })

if (!process.env.SHEET_ID || !process.env.API_KEY)
    return console.error('Please supply SHEET_ID and API_KEY in .env file')

const outputFile = path.join(__dirname, "../src/static/fastest-lap.json")

const doc = new GoogleSpreadsheet(process.env.SHEET_ID);

(async function() {
    await doc.useApiKey(process.env.API_KEY)
    await doc.loadInfo()
    const sheet = doc.sheetsByIndex[0]
    await sheet.loadCells('A1:B2')
    const data = {
        name: sheet.getCell(1,1).value,
        lapTime: sheet.getCell(1,0).value
    }
    fs.writeFileSync(outputFile, JSON.stringify(data))
}())