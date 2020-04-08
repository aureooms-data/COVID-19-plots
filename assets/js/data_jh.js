import * as countries from './countries.js'
import * as itertools from './lib/itertools.js'

const KEY_COUNTRY = 'Country/Region'
const KEY_STATE = 'Province/State'
const KEY_LATITUDE = 'Lat'
const KEY_LONGITUDE = 'Long'

export const TYPE_CONFIRMED = 'confirmed'
export const TYPE_DEATHS = 'deaths'
export const TYPE_RECOVERED = 'recovered'

export const types = [TYPE_CONFIRMED, TYPE_DEATHS, TYPE_RECOVERED]

export const load = (type) => {
  const URL = `https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_${type}_global.csv`
  return new Promise(function (resolve, reject) {
    d3.csv(URL).then(function (rows) {
      rows = sanitize(rows)
      rows = aggregateByCountry(rows)
      rows = itertools.addField(rows, 'source', 'jh_' + type)
      rows = Array.from(rows)
      resolve(rows)
    })
  })
}

/** Generates the data in thin format (one country/date/value per row)
 * @param {List} rows in wide format (row = one county with all dates/values)
 */
function * sanitize (rows) {
  for (const row of rows) {
    for (const column of Object.keys(row)) {
      if (![KEY_COUNTRY, KEY_STATE, KEY_LATITUDE, KEY_LONGITUDE]
        .includes(column)) {
        const [M, d, yy] = column.split('/')
        const dd = d.length === 1 ? '0' + d : d
        const MM = M.length === 1 ? '0' + M : M
        let yyyy = yy
        if (yyyy.length === 2) {
          yyyy = '20' + yyyy
        }
        const datestring = `${yyyy}-${MM}-${dd}`
        yield {
          datestring: datestring,
          value: parseInt(row[column], 10),
          country: countries.canonicalCountryName(row[KEY_COUNTRY]),
          state: row[KEY_STATE],
          latitude: row[KEY_LATITUDE],
          longitude: row[KEY_LONGITUDE]
        }
      }
    }
  }
}

/** For each day, aggregate by country and also add world total
 * @param {List} rows
 */
function * aggregateByCountry (rows) {
  const byDateCountry = itertools.group(rows, 'datestring')
  for (const datestring of Object.keys(byDateCountry)) {
    let worldTotal = 0
    byDateCountry[datestring] =
      itertools.group(byDateCountry[datestring], 'country')
    for (const country of Object.keys(byDateCountry[datestring])) {
      const rows = byDateCountry[datestring][country]
      if (rows.length > 0) {
        const aggregatedRow = {
          datestring: datestring,
          country: rows[0].country,
          value: 0
        }
        aggregatedRow.value = 0
        for (const row of rows) {
          aggregatedRow.value += row.value
        }
        worldTotal += aggregatedRow.value
        yield aggregatedRow
      }
    }
    yield {
      datestring: datestring,
      country: 'World',
      value: worldTotal
    }
  }
}
