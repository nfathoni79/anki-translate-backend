import 'dotenv-flow/config'
import express from 'express'
import puppeteer from 'puppeteer'
import cors from 'cors'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/translate', async (req, res) => {
  const enText = req.query.en

  if (!enText) {
    res.status(400).json({ message: 'Incomplete data' })
    return
  }

  // console.log('Opening browser...')
  // const browser = await puppeteer.launch({
  //   headless: true,
  //   defaultViewport: {
  //     width: 1280,
  //     height: 720,
  //   },
  // })

  console.log('Opening remote browser...')
  const browserlessToken = process.env.BROWSERLESS_TOKEN
  let browser

  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=${browserlessToken}`,
      defaultViewport: {
        width: 1280,
        height: 720,
      },
    })
  } catch (error) {
    console.log('Error opening browser')
    res.status(400).json({ message: 'Error opening browser' })
    return
  }

  const page = await browser.newPage()

  console.log('Opening page...')
  await page.goto(`https://translate.google.com/details?sl=en&tl=id&text=${enText}`, {
    waitUntil: 'networkidle0',
    timeout: 0,
  })

  // Click expand definitions if exists
  try {
    const expandDefSel = '#yDmH0d > c-wiz > div > div.kmXzdf > c-wiz > div.c11pPb > c-wiz > div > div.a2Icud > div.Sp3AF > div:nth-child(1) > div.ZShpvc > div:nth-child(1) > button'
    await page.click(expandDefSel)
  } catch (error) {
    console.log('Expand definitions: ', error.message)
  }

  // Click expand translations if exists
  try {
    const expandTransSel = '#yDmH0d > c-wiz > div > div.kmXzdf > c-wiz > div.c11pPb > c-wiz > div > div.a2Icud > div.GQpbTd > div:nth-child(1) > div.ZShpvc > div:nth-child(1) > button'
    await page.click(expandTransSel)
  } catch (error) {
    console.log('Expand translations: ', error.message)
  }

  // Wait a while after click
  await new Promise(_ => setTimeout(_, 1000))

  /** Element selectors */
  const selectors = {
    inputSection: 'div.ccvoYb > div.AxqVh > div.OPPzxe',
    bottomSection: '#yDmH0d > c-wiz > div > div.kmXzdf > c-wiz > div.c11pPb > c-wiz > div > div.a2Icud',
    defSection: 'div.Sp3AF > div.I87fLc > div.Dwvecf',
    fieldsWrapper: 'div.CF8Iy.CLHVBf',
    field: 'div.PG9puc',
    transWrapper: 'div.GQpbTd > div.I87fLc',
    transSection: 'div.Dwvecf > table.CFNMfb',
    enText: 'c-wiz.rm1UF.dHeVVb.UnxENd > span > span > div > textarea',
    enPhon: 'c-wiz.rm1UF.dHeVVb.UnxENd > div.UdTY9.BwTYAc.leDWne > div.kO6q6e > span',
    idText: 'c-wiz.sciAJc > div.QcsUad.BDJ8fb > div.usGWQd > div.KkbLmb > div.lRu31 > span.HwtZe > span.jCAhz.ChMk0b > span.ryNqvb',
    earlyFields: 'CF8Iy RZhose',
    partWrapper: 'KWoJId',
    part: 'div.eIKIse',
    partFieldWrapper: 'div.CF8Iy.rJnFff',
    defWrapper: 'eqNifb',
    hiddenDefWrapper: 'trQcMc',
    number: 'div.luGxAd > div.RSggmb',
    definition: 'div.JAk00 > div[lang="en"]',
    example: 'div.JAk00 > div.MZgjEb > q',
    transGroup: 'tbody.U87jab',
    transPart: 'th.yYp8Hb > div.G8Go6b > div.eIKIse.Nv4rrc',
    trans: 'th.rsNpAc.S18kfe > div.KnIHac > span.kgnlhe',
    hiddenTrans: 'th.rsNpAc.S18kfe > div.trQcMc > div.KnIHac > span.kgnlhe',
  }

  // Log inside evaluate
  page.on('console', (msg) => {
    for (let i = 0; i < msg.args().length; ++i)
      console.log(`${i}: ${msg.args()[i]}`);
  });

  // Scrape
  const translation = await page.evaluate(async (selectors) => {
    console.log('Scraping...')

    /**
     * Get the text of the fields of definition from a fields wrapper element.
     * @param {Element} fieldsWrapper 
     * @returns {String}
     */
    const scrapeFields = (fieldsWrapper) => {
      const fieldEls = fieldsWrapper.querySelectorAll(selectors.field)
      let fieldsString = ''
  
      for (const fieldEl of fieldEls) {
        fieldsString += `(${fieldEl.innerText.toUpperCase()}) `
      }
  
      return fieldsString
    }

    const inputSection = document.querySelector(selectors.inputSection)
    const bottomSection = document.querySelector(selectors.bottomSection)

    // Check if bottomSection is null
    let defSection = null
    try {
      defSection = bottomSection.querySelector(selectors.defSection)
    } catch (error) {
      return null
    }

    const transWrapper = bottomSection.querySelector(selectors.transWrapper)
    let transSection = null
    if (transWrapper != null && transWrapper.childElementCount > 0) {
      transSection = transWrapper.querySelector(selectors.transSection)
    }

    const enText = inputSection.querySelector(selectors.enText).value
    const enPhon = inputSection.querySelector(selectors.enPhon)?.innerText ?? ''
    const idText = inputSection.querySelector(selectors.idText).innerText

    /** First part of speech for translation with no transSection */
    let firstPart = ''

    /** Early fields from the beginning or after part of speech */
    let earlyFields = ''
    
    /** Parts of speech of the definitions */
    let defParts = []
    
    let defPartsIndex = -1

    /** Parts of speech of the translations */
    let transParts = []
    
    let transPartsIndex = -1

    // Scrape definitions
    console.log('Scraping definitions...')
    if (defSection != null) {
      for (let i = 0; i < defSection.childElementCount; i++) {
        let child = defSection.children[i]
  
        if (child.className == selectors.earlyFields) {
          // Fields in the beginning before part of speech
          earlyFields = scrapeFields(child)
        } else if (child.className == selectors.partWrapper) {
          // Part of speech
          defPartsIndex++
          const part = child.querySelector(selectors.part).innerText
          defParts.push({
            part,
            definitions: [],
          })
  
          // First part of speech for translation with no transSection
          if (firstPart == '') {
            firstPart = part
          }
  
          // Fields after part of speech
          const partFieldWrapper = child.querySelector(selectors.partFieldWrapper)
          if (partFieldWrapper != null) {
            earlyFields = scrapeFields(partFieldWrapper)
          }
        } else if (child.className == selectors.defWrapper || child.className == selectors.hiddenDefWrapper) {
          // Number
          const no = child.querySelector(selectors.number).innerText
          let defObj = {
            no,
            text: '',
            example: '',
          }
  
          // Early fields from the beginning or after part of speech
          if (earlyFields != '') {
            defObj.text += earlyFields
            earlyFields = ''
          }
  
          // Fields after number
          const fieldsWrapper = child.querySelector(selectors.fieldsWrapper)
          if (fieldsWrapper != null) {
            let fieldsString = scrapeFields(fieldsWrapper)
            defObj.text += fieldsString
          }
  
          // Definition
          const definition = child.querySelector(selectors.definition).innerText
          defObj.text += definition
  
          // Example
          const exampleEl = child.querySelector(selectors.example)
          if (exampleEl != null) {
            defObj.example = exampleEl.innerText
          }
  
          defParts[defPartsIndex].definitions.push(defObj)
        }
      }
    }

    // Scrape translations
    console.log('Scraping translations...')
    if (transSection == null) {
      transPartsIndex++
      transParts.push({
        part: firstPart,
        translations: [idText],
      })
    } else {
      // Translations groups by part of speech
      const transGroups = transSection.querySelectorAll(selectors.transGroup)

      for (let i = 0; i < transGroups.length; i++) {
        // One translations group
        const transGroup = transGroups[i]

        for (let j = 0; j < transGroup.childElementCount; j++) {
          // One translation within a group
          const child = transGroup.children[j]

          if (j == 0) {
            // Part of speech
            transPartsIndex++
            const part = child.querySelector(selectors.transPart).innerText
            transParts.push({
              part,
              translations: [],
            })

            let firstTrans = child.querySelector(selectors.trans)
            if (firstTrans == null) {
              firstTrans = child.querySelector(selectors.hiddenTrans)
            }

            if (i == 0 && firstTrans.innerText != idText) {
              transParts[transPartsIndex].translations.push(...[idText, firstTrans.innerText])
            } else {
              transParts[transPartsIndex].translations.push(firstTrans.innerText)
            }
          } else {
            let trans = child.querySelector(selectors.trans)
            if (trans == null) {
              trans = child.querySelector(selectors.hiddenTrans)
            }

            transParts[transPartsIndex].translations.push(trans.innerText)
          }
        }
      }
    }

    return { enText, enPhon, idText, defParts, transParts }
  }, selectors)

  await browser.close()

  if (!translation) {
    res.status(404).json({ message: 'Not found' })
    return
  }

  res.json({ translation })
})

app.listen(5000, () => {
  console.log('Server has started at port 5000')
})

export default app