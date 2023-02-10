#! /usr/bin/env node
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { client, v2 } from '@datadog/datadog-api-client'

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

  if(!TIEM_FORMAT.test(DD_FROM)) {
    console.error(`'DD_FROM' must be ISO 8601 format with timezone information`)
    return false
  }

  if(!TIEM_FORMAT.test(DD_TO)) {
    console.error(`'DD_TO' must be ISO 8601 format with timezone information`)
    return false
  }

  return true
}

const checkInput = () => {
  if (!isValidInput()) {
    if (process.platform === 'win32') {
      console.error(USAGE_win32)
    } else {
      console.error(USAGE)
    }
    process.exit(1)
  }

  DD_INDEX = DD_INDEX ? DD_INDEX : 'main'
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
  }

  console.dir(params)
  params.DD_API_KEY = DD_API_KEY
  params.DD_APP_KEY = DD_APP_KEY

  return params
}

const createDataDogClient = () => {
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

  return new v2.LogsApi(configuration)
}


const intercepter = (logs) => {
  if(!logger) {
    logger = fs.createWriteStream(DD_OUTPUT)
    logger.write('') // clear existing content
    logger = fs.createWriteStream(DD_OUTPUT, {
      flags: 'a' // 'a' means appending
    })
    logger.write('Date,Message')
  }

  if(logs && logs.length > 0) {
    total += logs.length
    for(const log of logs) {
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

const getLogs = async (ddClient, intercepter) => {
  const params = {
    filterQuery: DD_QUERY,
    filterIndex: DD_INDEX,
    filterFrom: new Date(DD_FROM),
    filterTo: new Date(DD_TO),
    pageLimit: 5000,
    sort: 'timestamp' // timestamp ascending
  }
  let nextPage = null
  let n = 0
  do {
    console.log(`Requesting page ${++n}`)
    const query = nextPage ? { ...params, pageCursor: nextPage } : params
    const result = await ddClient.listLogsGet(query)
    intercepter(result.data)
    nextPage = result?.meta?.page?.after
  } while (nextPage)
}

const main = async () => {
  const inputs = checkInput()
  const ddClient = createDataDogClient()
  await getLogs(ddClient, intercepter, endCallback)
  console.log(`downloaded ${total} logs`)
}

await main()
