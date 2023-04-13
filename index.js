import express from 'express'
import puppeteer from 'puppeteer'
import cors from 'cors'

const app = express()

app.use(cors())
app.use(express.json())

app.post('/scrape', async (req, res) => {
  const enText = req.body.enText

  if (!enText) {
    res.status(400).json({ message: 'Incomplete data' })
    return
  }

  console.log('Opening browser...')
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: {
      width: 1280,
      height: 720,
    },
  })

  const page = await browser.newPage()

  console.log('Opening page...')
  await page.goto(`https://translate.google.com/?sl=en&tl=id&text=${enText}`, {
    waitUntil: 'networkidle0',
  })

  // Click expand definitions if exists
  try {
    const expandDefSel = 'div.Sp3AF > div.I87fLc.FnSTic.XzOhkf > div.ZShpvc > div.VK4HE'
    await page.click(expandDefSel)
  } catch (error) {
    console.log('Expand definitions:', error.message)
  }

  // Click expand translations if exists
  try {
    const expandTransSel = '#yDmH0d > c-wiz > div > div.WFnNle > c-wiz > div.OlSOob > c-wiz > div.kGmWO > c-wiz > div > div > div.GQpbTd.WZapbb > div > div.ZShpvc > div.VK4HE'
    await page.click(expandTransSel)
  } catch (error) {
    console.log('Expand translations:', error.message)
  }

  // Wait a while after click
  await new Promise(_ => setTimeout(_, 1000))

  // Log inside evaluate
  page.on('console', (msg) => {
    for (let i = 0; i < msg.args().length; ++i)
      console.log(`${i}: ${msg.args()[i]}`);
  });

  // Scrape
  const translation = await page.evaluate(() => {
    console.log('Scraping...')
    const inputSectionSel = 'div.ccvoYb.EjH7wc > div.AxqVh > div.OPPzxe'
    const bottomSectionSel = 'div.kGmWO > c-wiz.zpzJBc > div.jTj8gd > div.a2Icud'
    const defSectionSel = 'div.Sp3AF > div.I87fLc.FnSTic.XzOhkf > div.Dwvecf'
    const fieldSel = 'div.PG9puc'
    const transWrapperSel = 'div.GQpbTd.WZapbb > div.I87fLc.oLovEc.XzOhkf'
    const transSectionSel = 'div.Dwvecf > table.CFNMfb'
    const enTextSel = 'c-wiz.rm1UF.UnxENd.dHeVVb > span[jsname="ZdXDJ"] > span[ssk="6:FCIgBe"] > div.QFw9Te > div.A3dMNc > span[jsname="BvKnce"]'
    const enPhonSel = 'c-wiz.rm1UF.UnxENd.dHeVVb > div.UdTY9.BwTYAc > div.kO6q6e'
    const idTextSel = 'c-wiz.sciAJc > div.QcsUad.BDJ8fb > div.usGWQd > div.KkbLmb > div.lRu31 > span.HwtZe > span.jCAhz.ChMk0b > span.ryNqvb'

    const earlyFieldsClass = 'CF8Iy RZhose'
    const partWrapperClass = 'KWoJId'
    const partSel = 'div.eIKIse'
    const partFieldWrapperSel = 'div.CF8Iy.rJnFff'
    const defWrapperClass = 'eqNifb'
    const hiddenDefWrapperClass = 'trQcMc'
    const numberSel = 'div.luGxAd > div.RSggmb'
    const fieldsWrapperSel = 'div.CF8Iy.CLHVBf'
    const definitionSel = 'div.JAk00.OvhKBb > div.fw3eif'
    const exampleSel = 'div.JAk00.OvhKBb > div.MZgjEb'

    const transGroupSel = 'tbody.U87jab'
    const transPartSel = 'th.yYp8Hb > div.G8Go6b > div.eIKIse.Nv4rrc'
    const transSel = 'th.rsNpAc.S18kfe > div.KnIHac > span.kgnlhe'
    const hiddenTransSel = 'th.rsNpAc.S18kfe > div.trQcMc > div.KnIHac > span.kgnlhe'

    // Capitalize text
    const capitalize = (str) => {
      return str.charAt(0).toUpperCase() + str.slice(1)
    }

    // Scrape fields
    const scrapeFields = (fieldsWrapper) => {
      const fieldEls = fieldsWrapper.querySelectorAll(fieldSel)
      let fieldsString = ''
    
      for (const fieldEl of fieldEls) {
        fieldsString += `(${fieldEl.innerText.toUpperCase()}) `
      }
    
      return fieldsString
    }

    const inputSection = document.querySelector(inputSectionSel)
    const bottomSection = document.querySelector(bottomSectionSel)

    // Check if bottomSection is null
    let defSection = null
    try {
      defSection = bottomSection.querySelector(defSectionSel)
    } catch (error) {
      return null
    }

    const transWrapper = bottomSection.querySelector(transWrapperSel)
    let transSection = null
    if (transWrapper != null && transWrapper.childElementCount > 0) {
      transSection = transWrapper.querySelector(transSectionSel)
    }

    const enText = inputSection.querySelector(enTextSel).innerText
    const enPhon = inputSection.querySelector(enPhonSel).innerText
    const idText = inputSection.querySelector(idTextSel).innerText

    let firstPart = ''
    let earlyFields = ''
    let defParts = []
    let defPartsIndex = -1

    let transParts = []
    let transPartsIndex = -1

    // Scrape definitions
    console.log('Scraping definitions...')
    for (let i = 0; i < defSection.childElementCount; i++) {
      let child = defSection.children[i]

      if (child.className == earlyFieldsClass) {
        // Fields in the beginning before part of speech
        earlyFields = scrapeFields(child)
      } else if (child.className == partWrapperClass) {
        // Part of speech
        defPartsIndex++
        const part = capitalize(child.querySelector(partSel).innerText)
        defParts.push({
          part: part,
          definitions: [],
        })

        // First part of speech for translation with no transSection
        if (firstPart == '') {
          firstPart = part
        }

        // Fields after part of speech
        const partFieldWrapper = child.querySelector(partFieldWrapperSel)
        if (partFieldWrapper != null) {
          earlyFields = scrapeFields(partFieldWrapper)
        }
      } else if (child.className == defWrapperClass || child.className == hiddenDefWrapperClass) {
        // Number
        const no = child.querySelector(numberSel).innerText
        let defObj = {
          no: no,
          text: '',
          example: '',
        }

        // Early fields from the beginning or after part of speech
        if (earlyFields != '') {
          defObj.text += earlyFields
          earlyFields = ''
        }

        // Fields after number
        const fieldsWrapper = child.querySelector(fieldsWrapperSel)
        if (fieldsWrapper != null) {
          let fieldsString = scrapeFields(fieldsWrapper)
          defObj.text += fieldsString
        }

        // Definition
        const definition = child.querySelector(definitionSel).innerText
        defObj.text += definition

        // Example
        const exampleEl = child.querySelector(exampleSel)
        if (exampleEl != null) {
          defObj.example = exampleEl.innerText
        }

        defParts[defPartsIndex].definitions.push(defObj)
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
      const transGroups = transSection.querySelectorAll(transGroupSel)

      for (let i = 0; i < transGroups.length; i++) {
        // One translations group
        const transGroup = transGroups[i]

        for (let j = 0; j < transGroup.childElementCount; j++) {
          // One translation within a group
          const child = transGroup.children[j]

          if (j == 0) {
            // Part of speech
            transPartsIndex++
            const part = capitalize(child.querySelector(transPartSel).innerText)
            transParts.push({
              part: part,
              translations: [],
            })

            let firstTrans = child.querySelector(transSel)
            if (firstTrans == null) {
              firstTrans = child.querySelector(hiddenTransSel)
            }

            if (i == 0 && firstTrans.innerText != idText) {
              transParts[transPartsIndex].translations.push(...[idText, firstTrans.innerText])
            } else {
              transParts[transPartsIndex].translations.push(firstTrans.innerText)
            }
          } else {
            let trans = child.querySelector(transSel)
            if (trans == null) {
              trans = child.querySelector(hiddenTransSel)
            }

            transParts[transPartsIndex].translations.push(trans.innerText)
          }
        }
      }
    }

    return { enText, enPhon, idText, defParts, transParts }
  })

  await browser.close()

  if (translation) {
    res.json({ translation })
  } else {
    res.status(404).json({ message: 'Not found' })
  }
})

app.listen(5000, () => {
  console.log('Server has started')
})