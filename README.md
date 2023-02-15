## Usage

### Unix like OS
```
# required params
export DD_API_KEY=''
export DD_APP_KEY=''

# optional params with default values
export DD_SITE='datadoghq.com'               # EU URL 'datadoghq.eu'
export DD_INDEXES='*'                        # you can specify multiple indexes: 'main, index-1, index-2'
export DD_FROM='2023-02-06T03:14:00-05:30'   # ISO 8601 format with timezone, default: last 10 min from current time
export DD_TO='2023-02-06T03:24:00-05:30'     # ISO 8601 format with timezone, default: current time
export DD_OUTPUT='exported.csv'              # extension must be csv
export DD_QUERY='*'
export DD_SLEEP='1000'                       # time unit is ms, this is used to avoid 429 error
export DD_COLUMNS='Date,Message'             # supported columns: 'Date,Host,Service,Message,Status' case insensitive

npm exec dd-downloader
```
### Windows
```
set DD_SITE=datadoghq.com
set DD_API_KEY=api-key
set DD_APP_KEY=app-key
set DD_INDEXES=main
set DD_FROM=2023-02-06T03:24:00Z
set DD_TO=2023-02-06T03:25:00Z
set DD_OUTPUT=exported.csv
set DD_QUERY=service:*
set DD_SLEEP=1000
set DD_COLUMNS=Date,Message

npm exec dd-downloader
```
