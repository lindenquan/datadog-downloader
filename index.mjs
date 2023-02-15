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
  DD_INDEXES,
  DD_QUERY,
  DD_FROM,
  DD_TO,
  DD_OUTPUT,
  DD_SLEEP,
  DD_COLUMNS,
} = process.env

let DD_FORMAT
let total = 0
const TIEM_FORMAT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?([+-]\d\d:\d\d)|Z$/i
const USAGE_win32 = `
Usage:
set DD_SITE=datadoghq.com # or DD_SITE=datadoghq.eu
set DD_API_KEY=api-key
set DD_APP_KEY=app-key
set DD_INDEXES=main
set DD_FROM=2023-02-06T03:24:00Z
set DD_TO=2023-02-06T03:25:00Z
set DD_OUTPUT=exported.csv
set DD_QUERY=service:*
set DD_SLEEP=1000
set DD_COLUMNS='ate,Message

npm exec dd-downloader
`
const USAGE = `
Usage:
# required params
export DD_API_KEY=''
export DD_APP_KEY=''

# optional params with default values
export DD_SITE='datadoghq.com'               # EU URL 'datadoghq.eu'
export DD_INDEXES='*'
export DD_FROM='2023-02-06T03:14:00-05:30'   # ISO 8601 format with timezone, default: last 10 min from current time
export DD_TO='2023-02-06T03:24:00-05:30'     # ISO 8601 format with timezone, default: current time
export DD_OUTPUT='exported.csv'              # extension must be csv
export DD_QUERY='*'
export DD_SLEEP='1000'                       # time unit is ms, this is used to avoid 429 error
export DD_COLUMNS='Date,Message'             # supported columns: 'Date,Host,Service,Message,Status' case insensitive

npm exec dd-downloader
`
const ALL_COLUMNS = ['Date', 'Host', 'Service', 'Message', 'Status']
const DEFAULT_COLUMNS = 'Date, Message'
const DEFAULT_DURATION = 1000 * 60 * 10 // 10 min
let logger

Object.defineProperty(String.prototype, 'capitalize', {
  value: function () {
    return this.charAt(0).toUpperCase() + this.slice(1).toLowerCase();
  },
  enumerable: false
});

const isValidInput = () => {
  if (!DD_API_KEY || !DD_APP_KEY) {
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

  if (DD_SLEEP) {
    DD_SLEEP = new Number(DD_SLEEP)
    if (isNaN(DD_SLEEP) || DD_SLEEP < 0) {
      console.error(`'DD_SLEEP' must be greater than 0`)
      return false
    }
  }

  return true
}

const isValidColumns = (columns) => {
  let columList = []
  if (columns) {
    columns = columns.split(',')
    for (let col of columns) {
      col = col.trim().capitalize()
      if (!ALL_COLUMNS.includes(col)) {
        console.error(`Column "${col}" is not supported`)
        return false;
      }
      columList.push(col)
    }
  }

  DD_COLUMNS = columList
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

  if (!isValidColumns(DD_COLUMNS)) {
    process.exit(1);
  }

  const strs = DD_OUTPUT.split('.')
  DD_FORMAT = strs[strs.length - 1]
  DD_OUTPUT = path.resolve(DD_OUTPUT)

  const indexStrList = DD_INDEXES.split(',')
  const indexList = []
  for (let i of indexStrList) {
    if (i) {
      indexList.push(i)
    }
  }

  DD_INDEXES = indexList
  const params = {
    DD_SITE,
    DD_INDEXES,
    DD_QUERY,
    DD_FROM,
    DD_TO,
    DD_OUTPUT,
    DD_FORMAT,
    DD_SLEEP,
    DD_COLUMNS
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

    let logStr = ''
    for (let col of DD_COLUMNS) {
      logStr += `${col},`
    }

    logger.write(logStr.slice(0, -1))
  }

  if (logs && logs.length > 0) {
    total += logs.length
    for (const log of logs) {
      let jsonLog = {
        Date: log.attributes.timestamp.toISOString(),
        Host: log.attributes.host,
        Service: log.attributes.service,
        Status: log.attributes.status,
        Message: log.attributes.message,
      }

      let logStr = ''
      for (let col of DD_COLUMNS) {
        logStr += `"${jsonLog[col]}",`
      }

      logger.write(`\n${logStr.slice(0, -1)}`)
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
  const params = {
    body: {
      filter: {
        indexes: DD_INDEXES,
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
    if (nextPage) {
      params.body.page.cursor = nextPage
    }
    let result
    try {
      result = await apiInstance.listLogs(params)
    } catch (error) {
      console.error(error.toString())
      process.exit(1)
    }
    await sleep(DD_SLEEP) // avoid 429 too many request error
    intercepter(result.data)
    nextPage = result?.meta?.page?.after
  } while (nextPage)
}

const setDefaultValues = () => {
  DD_OUTPUT = DD_OUTPUT ? DD_OUTPUT : 'exported.csv'
  DD_SITE = DD_SITE ? DD_SITE : 'datadoghq.com'
  DD_SLEEP = DD_SLEEP ? DD_SLEEP : 1000
  DD_COLUMNS = DD_COLUMNS ? DD_COLUMNS : DEFAULT_COLUMNS
  DD_QUERY = DD_QUERY ? DD_QUERY : '*'
  DD_INDEXES = DD_INDEXES ? DD_INDEXES : '*'
  if (!DD_INDEXES) {
    DD_INDEXES = '*'
    console.info(`Index "*" doesn't include historical indexes. If you want to search on a historical index, you need to specify it.`)
  }
  DD_FROM = DD_FROM ? DD_FROM : new Date(new Date().getTime() - DEFAULT_DURATION).toISOString()
  DD_TO = DD_TO ? DD_TO : new Date().toISOString()
}

const main = async () => {
  setDefaultValues()
  const ddConfig = createDataDogConfig()
  const inputs = await checkInput(ddConfig)
  await getLogs(ddConfig, intercepter, endCallback)
  console.log(`downloaded ${total} logs`)
}

await main()
