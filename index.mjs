#! /usr/bin/env node
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { client, v1, v2 } from '@datadog/datadog-api-client'

dotenv.config()
let {
  DD_SITE,
  DD_API_KEY,
  DD_APP_KEY,
  DD_INDEX,
  DD_QUERY,
  DD_FROM,
  DD_TO,
  DD_OUTPUT,
  DD_SLEEP,
} = process.env
// const apiInstance = new v2.LogsApi(configuration)
let DD_FORMAT
let total = 0
const TIEM_FORMAT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?([+-]\d\d:\d\d)|Z$/i
const USAGE_win32 = `
Usage:
set DD_SITE=datadoghq.com # or DD_SITE=datadoghq.eu
set DD_API_KEY=api-key
set DD_APP_KEY=app-key
set DD_INDEX=main
set DD_FROM=2023-02-06T03:24:00Z
set DD_TO=2023-02-06T03:25:00Z
set DD_OUTPUT=exported.csv
set DD_QUERY=service:*
set DD_SLEEP=1000

npm exec dd-downloader
`
const USAGE = `
Usage:
export DD_SITE='datadoghq.com' # or DD_SITE='datadoghq.eu'
export DD_API_KEY=''
export DD_APP_KEY=''
export DD_INDEX='main'
export DD_FROM=''
export DD_TO=''
export DD_OUTPUT='exported.csv'
export DD_QUERY='service:*'
export DD_SLEEP='1000'

npm exec dd-downloader
`
let logger

const isValidInput = () => {
  if (!DD_API_KEY || !DD_APP_KEY || !DD_QUERY || !DD_FROM || !DD_TO) {
    console.error(`required parameters: 'DD_API_KEY', 'DD_APP_KEY', 'DD_QUERY', 'DD_FROM', 'DD_TO'`)
    return false
  }

  if (DD_OUTPUT && !(DD_OUTPUT.endsWith('csv'))) {
    console.error(`'DD_OUTPUT' must have extension 'csv'. DD_OUTPUT=${DD_OUTPUT}`)
    return false
  }

  if (!TIEM_FORMAT.test(DD_FROM)) {
    console.error(`'DD_FROM' must be ISO 8601 format with timezone information`)
    return false
  }

  if (!TIEM_FORMAT.test(DD_TO)) {
    console.error(`'DD_TO' must be ISO 8601 format with timezone information`)
    return false
  }

  DD_SLEEP = new Number(DD_SLEEP)
  if(isNaN(DD_SLEEP) || DD_SLEEP < 0) {
    console.error(`'DD_SLEEP' must be greater than 0`)
    return false
  }

  return true
}

const isValidIndex = async (ddConfig, index) => {
  if (index === '*') {
    return true
  }

  const apiInstance = new v1.LogsIndexesApi(ddConfig);
  const data = await apiInstance.listLogIndexes();
  const indexes = []
  data.indexes.forEach(i => indexes.push(i.name))
  const exist = indexes.includes(index)

  if (!exist) {
    console.error(`Index "${index}" doesn't exist.`)
    console.info(`All existing index: ${JSON.stringify(indexes, null, 2)}`)
    console.info(`"${index}" might be a historical index`)
  }
  return exist
}

const checkInput = async (ddConfig) => {
  if (!isValidInput()) {
    if (process.platform === 'win32') {
      console.error(USAGE_win32)
    } else {
      console.error(USAGE)
    }
    process.exit(1)
  }

  DD_INDEX = DD_INDEX ? DD_INDEX : 'main'

  // if (!(await isValidIndex(ddConfig, DD_INDEX))) {
  //   process.exit(1);
  // }

  DD_OUTPUT = DD_OUTPUT ? DD_OUTPUT : 'exported.csv'
  const strs = DD_OUTPUT.split('.')
  DD_FORMAT = strs[strs.length - 1]
  DD_OUTPUT = path.resolve(DD_OUTPUT)
  DD_SITE = DD_SITE ? DD_SITE : 'datadoghq.com'

  const params = {
    DD_SITE,
    DD_INDEX,
    DD_QUERY,
    DD_FROM,
    DD_TO,
    DD_OUTPUT,
    DD_FORMAT,
    DD_SLEEP,
  }

  console.dir(params)
  params.DD_API_KEY = DD_API_KEY
  params.DD_APP_KEY = DD_APP_KEY

  return params
}

const createDataDogConfig = () => {
  const configurationOpts = {
    debug: false,
    authMethods: {
      apiKeyAuth: DD_API_KEY,
      appKeyAuth: DD_APP_KEY
    },
  }

  let configuration = client.createConfiguration(configurationOpts)
  client.setServerVariables(configuration, {
    site: DD_SITE
  })

  return configuration
}


const intercepter = (logs) => {
  if (!logger) {
    logger = fs.createWriteStream(DD_OUTPUT)
    logger.write('') // clear existing content
    logger = fs.createWriteStream(DD_OUTPUT, {
      flags: 'a' // 'a' means appending
    })
    logger.write('Date,Message')
  }

  if (logs && logs.length > 0) {
    total += logs.length
    for (const log of logs) {
      let jsonLog = {
        date: log.attributes.timestamp.toISOString(),
        message: log.attributes.message
      }

      logger.write(`\n"${jsonLog.date}","${jsonLog.message}"`)
    }
  }
}

const endCallback = () => {
  logger.end()
}

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const getLogs = async (ddConfig, intercepter) => {
  const apiInstance = new v2.LogsApi(ddConfig)
  // const params = {
  //   filterQuery: DD_QUERY,
  //   filterIndex: DD_INDEX,
  //   filterFrom: new Date(DD_FROM),
  //   filterTo: new Date(DD_TO),
  //   pageLimit: 5000,
  //   sort: 'timestamp' // timestamp ascending
  // }

  const params = {
    body: {
      filter: {
        indexes: [DD_INDEX],
        from: DD_FROM,
        to: DD_TO,
        query: DD_QUERY,
      },
      page: {
        cursor: undefined,
        limit: 5000,
      },
      sort: 'timestamp' // timestamp ascending
    }
  }
  let nextPage = null
  let n = 0
  do {
    console.log(`Requesting page ${++n}`)
    if(nextPage) {
      params.body.page.cursor = nextPage
    }
    let result
    try {
      result = await apiInstance.listLogs(params)
    } catch (error) {
      throw error
      console.error(error.toString())
      process.exit(1)
    }
    await sleep(DD_SLEEP) // avoid 429 too many request error
    intercepter(result.data)
    nextPage = result?.meta?.page?.after
  } while (nextPage)
}

const main = async () => {
  const ddConfig = createDataDogConfig()
  const inputs = await checkInput(ddConfig)
  await getLogs(ddConfig, intercepter, endCallback)
  console.log(`downloaded ${total} logs`)
}

await main()
