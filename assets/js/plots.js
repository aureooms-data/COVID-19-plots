/* COVID-19-plots.js | MIT License | github.com/holgerdell/COVID-19-plots */

import { getState, updateState } from './state.js'
import * as data from './data.js'
import * as countries from './countries.js' // number of days to average on

import color from './color.js'

/* Time constants */
const MILLISECONDS_IN_A_DAY = 1000 * 60 * 60 * 24

/* Align curve threshold */
const ALIGN_THRESHOLD_NORMALIZED = 0.1 // align to first day >= 0.1 cases per 100,000
const ALIGN_THRESHOLD = 100 // align to first day with >= 100 cases

const SMOOTHNESS_PARAMETER = 3

function setField (points, source = 'value', target = 'y') {
  for (const d of points) {
    d[target] = d[source]
  }
}

function multiply (points, field = 'y', factor = 1) {
  for (const d of points) {
    d[field] = d[field] * factor
  }
}

/* given a sequence of d with a field d.field, smoothen the d.field value */
function smoothen (points, field = 'y') {
  const buffer = []
  for (let j = 0; j < SMOOTHNESS_PARAMETER; ++j) {
    buffer.push(0)
  }
  for (const d of points) {
    buffer.splice(0, 1)
    buffer.push(d[field])
    d[field] = buffer.reduce((a, b) => a + b) / buffer.length
  }
}

function * yieldRawData (countries, dataset) {
  for (let i = 0; i < countries.length; i++) {
    yield ({
      countryName: countries[i],
      countryIndex: i,
      curve: data.getTimeSeries(countries[i], dataset)
    })
  }
}

function getLastDateBelowThreshold (points, threshold, field = 'y') {
  let last
  for (const p of points) {
    if (p[field] >= threshold) {
      return (last !== undefined) ? last.date : undefined
    } else {
      last = p
    }
  }
  return undefined
}

function getFirstDateAboveThreshold (points, threshold, field = 'y') {
  for (const p of points) {
    if (p[field] >= threshold) {
      return p.date
    }
  }
  return undefined
}

function * prepareDoublingTimeData (state) {
  const countryCurves = yieldRawData(state.countries, state.dataset)
  const params = state.params[state.plot]
  for (const countryData of countryCurves) {
    setField(countryData.curve, 'value', 'y')
    setField(countryData.curve, 'date', 'x')
    if (params.smooth) smoothen(countryData.curve, 'y')

    for (const d of countryData.curve) {
      d.countryIndex = countryData.countryIndex
      const last = getLastDateBelowThreshold(countryData.curve, d.y / 2, 'y')
      if (last !== undefined) {
        d.doublingTime = (d.date - last) / MILLISECONDS_IN_A_DAY
      } else {
        d.doublingTime = undefined
      }
    }
    setField(countryData.curve, 'doublingTime', 'y')
    countryData.curve = countryData.curve.filter((d) => d.x !== undefined && d.y !== undefined)
    yield countryData
  }
}

function * prepareDateOrTrajectoryData (state) {
  const countryCurves = yieldRawData(state.countries, state.dataset)
  const params = state.params[state.plot]
  for (const countryData of countryCurves) {
    setField(countryData.curve, 'value', 'y')
    if (params.normalize) multiply(countryData.curve, 'y', 100000 / countries.getInfo(countryData.countryName).population)
    if (params.smooth) smoothen(countryData.curve, 'y')

    const threshold = (params.normalize) ? ALIGN_THRESHOLD_NORMALIZED : ALIGN_THRESHOLD
    const firstDateAboveThreshold = getFirstDateAboveThreshold(countryData.curve, threshold, 'y')

    let previousValue = 0
    for (const d of countryData.curve) {
      const cumulative = d.y
      d.countryIndex = countryData.countryIndex
      if (!isNaN(d.y) && d.y !== undefined && d.y > 0) {
        if (!params.cumulative || state.plot === 'trajectory') {
          d.y -= previousValue
          previousValue = cumulative
        }
      }
      if (d.y <= 0) d.y = undefined
      if (state.plot === 'trajectory') {
        d.x = cumulative
        if (d.x <= 0) d.x = undefined
      } else if (!params.align) {
        d.x = d.date
      } else {
        if (d.date >= firstDateAboveThreshold) {
          d.x = (d.date - firstDateAboveThreshold) / MILLISECONDS_IN_A_DAY
        } else {
          d.x = undefined
        }
      }
    }
    countryData.curve = countryData.curve.filter(d => d.x !== undefined && d.y !== undefined)
    yield countryData
  }
}

function toggle (key) {
  return () => {
    const state = getState()
    if (state.params[state.plot][key] !== undefined) { // only toggle if parameter is defined for this plot.
      updateState({ params: { [state.plot]: { [key]: !state.params[state.plot][key] } } })
    }
  }
}

const toggleCumulative = toggle('cumulative')
const toggleLog = toggle('logplot')
const toggleNormalize = toggle('normalize')
const toggleAlign = toggle('align')
const toggleSmooth = toggle('smooth')

function cycle (key, values, stepsize) {
  const state = getState()
  const oldIndex = values.indexOf(state[key])
  const newIndex = (oldIndex + stepsize + values.length) % values.length
  updateState({ [key]: values[newIndex] })
}

const nextDataSet = () => cycle('dataset', data.availableDatasets(), +1)
const prevDataSet = () => cycle('dataset', data.availableDatasets(), -1)

const nextPlot = () => cycle('plot', Object.keys(plots), +1)
const prevPlot = () => cycle('plot', Object.keys(plots), -1)

const buttonPlot = {
  icon: state => plots[state.plot].icon,
  tooltip: state => `Current plot is '${state.plot}'. Available plots are: ${Object.keys(plots).join(', ')}. [p]`,
  classList: {
    list: true
  },
  style: {
    backgroundColor: state => {
      const values = Object.keys(plots)
      return color(values.indexOf(state.plot), values.length)
    }
  },
  onClick: nextPlot
}

const buttonColorScheme = {
  icon: state => state.colorScheme === 'light' ? 'brightness_5' : 'brightness_2',
  tooltip: state => `Color scheme. Current: ${state.colorScheme}`,
  onClick: () => updateState({ colorScheme: getState().colorScheme === 'light' ? 'dark' : 'light' })
}

const buttonDataset = {
  icon: 'folder',
  tooltip: state => `Current dataset is '${state.dataset}'. Available datasets are: ${Object.values(data.availableDatasets()).join(', ')}. [d]`,
  style: {
    backgroundColor: state => {
      const datasets = data.availableDatasets()
      return color(datasets.indexOf(state.dataset), datasets.length)
    }
  },
  classList: {
    list: true
  },
  onClick: nextDataSet
}

const buttonSmooth = {
  icon: 'gesture',
  tooltip: state => (state.params[state.plot].smooth
    ? `Disable taking average of last ${SMOOTHNESS_PARAMETER} measurements`
    : `Take average of last ${SMOOTHNESS_PARAMETER} measurements`) + ' [s]',
  classList: {
    toggled: state => state.params[state.plot].smooth
  },
  onClick: toggleSmooth
}

const buttonLogplot = {
  icon: 'linear_scale',
  tooltip: state => (state.params[state.plot].logplot
    ? 'Switch to linear scale'
    : (state.plot === 'trajectory'
      ? 'Switch to log-log-plot'
      : 'Switch to log-plot')) + ' [l]',
  classList: {
    toggled: state => state.params[state.plot].logplot,
    disabled: state => state.params[state.plot].cumulative === false
  },
  onClick: toggleLog
}

const buttonNormalize = {
  icon: 'supervisor_account',
  tooltip: state => (state.params[state.plot].normalize
    ? 'Disable normalization by population'
    : 'Normalize by population') + ' [n]',
  classList: {
    toggled: state => state.params[state.plot].normalize
  },
  onClick: toggleNormalize
}

const plots = {
  calendar: {
    scaleX: (params, domain, range) => params.align ? d3.scaleLinear(domain, range).nice() : d3.scaleUtc(domain, range).nice(),
    scaleY: (params, domain, range) => params.logplot ? d3.scaleLog(domain, range).nice() : d3.scaleLinear(domain, range).nice(),
    labelX: (params, cases = 'cases') => (params.align
      ? (params.normalize
        ? `days after ${ALIGN_THRESHOLD_NORMALIZED} ${cases} per 100,000`
        : `days after ${ALIGN_THRESHOLD} ${cases}`)
      : 'Date'),
    labelY: (params, cases = 'cases') => (params.cumulative
      ? `Total ${cases} so far`
      : `New ${cases}`) +
      (params.normalize ? ' per 100,000 inhabitants' : '') +
      (params.smooth ? ' [smooth]' : '') +
      (params.logplot ? ' [log-scale]' : ''),
    curves: prepareDateOrTrajectoryData,
    fixState: (state) => {
      // cannot be both logplot and non-cumulative ?
      const logplot = state.params.calendar.logplot && state.params.calendar.cumulative
      if (logplot !== state.params.calendar.logplot) {
        updateState({ params: { calendar: { logplot } } })
        return true
      }
      return false
    },
    icon: 'schedule',
    nav: [
      buttonColorScheme,
      buttonPlot,
      buttonDataset,
      {
        icon: 'functions',
        tooltip: 'Cumulative plot [c]',
        classList: {
          toggled: state => state.params.calendar.cumulative
        },
        onClick: toggleCumulative
      },
      buttonLogplot,
      buttonNormalize,
      {
        icon: state => state.params.calendar.align ? 'call_merge' : 'call_split',
        tooltip: state => state.params.calendar.normalize
          ? `Align by first day with ${ALIGN_THRESHOLD_NORMALIZED} cases per 100,000 [a]`
          : `Align by first day with ${ALIGN_THRESHOLD} cases [a]`,
        classList: {
          toggled: state => state.params.calendar.align
        },
        onClick: toggleAlign
      },
      buttonSmooth
    ],
    shortcuts: (event) => {
      if (!event.ctrlKey && !event.altKey) {
        switch (event.key) {
          case 'p': nextPlot(); break
          case 'P': prevPlot(); break
          case 'c': toggleCumulative(); break
          case 'l': toggleLog(); break
          case 'n': toggleNormalize(); break
          case 'd': nextDataSet(); break
          case 'D': prevDataSet(); break
          case 'a': toggleAlign(); break
          case 's': toggleSmooth(); break
        }
      }
    }
  },
  trajectory: {
    scaleX: (params, domain, range) => params.logplot ? d3.scaleLog(domain, range).nice() : d3.scaleLinear(domain, range).nice(),
    scaleY: (params, domain, range) => params.logplot ? d3.scaleLog(domain, range).nice() : d3.scaleLinear(domain, range).nice(),
    labelX: (params, cases = 'cases') => `Total ${cases} so far` +
        (params.normalize ? ' per 100,000 inhabitants' : '') +
        (params.logplot ? ' [log-scale]' : ''),
    labelY: (params, cases = 'cases') => `New ${cases}` +
      (params.normalize ? ' per 100,000 inhabitants' : '') +
      (params.smooth ? ' [smooth]' : '') +
      (params.logplot ? ' [log-scale]' : ''),
    curves: prepareDateOrTrajectoryData,
    icon: 'trending_down',
    nav: [
      buttonColorScheme,
      buttonPlot,
      buttonDataset,
      buttonNormalize,
      buttonLogplot,
      buttonSmooth
    ],
    shortcuts: (event) => {
      if (!event.ctrlKey && !event.altKey) {
        switch (event.key) {
          case 'p': nextPlot(); break
          case 'P': prevPlot(); break
          case 'l': toggleLog(); break
          case 'n': toggleNormalize(); break
          case 'd': nextDataSet(); break
          case 'D': prevDataSet(); break
          case 's': toggleSmooth(); break
        }
      }
    }
  },
  doubling: {
    scaleX: (params, domain, range) => d3.scaleUtc(domain, range).nice(),
    scaleY: (params, domain, range) => d3.scaleLinear(domain, range).nice(),
    labelX: 'Date',
    labelY: (params, cases = 'cases') => `Days since last doubling of ${cases}` +
      (params.smooth ? ' [smooth]' : ''),
    curves: prepareDoublingTimeData,
    icon: 'double_arrow',
    nav: [
      buttonColorScheme,
      buttonPlot,
      buttonDataset,
      buttonSmooth
    ],
    shortcuts: (event) => {
      if (!event.ctrlKey && !event.altKey) {
        switch (event.key) {
          case 'p': nextPlot(); break
          case 'P': prevPlot(); break
          case 'l': toggleLog(); break
          case 'n': toggleNormalize(); break
          case 'd': nextDataSet(); break
          case 'D': prevDataSet(); break
          case 's': toggleSmooth(); break
        }
      }
    }
  }
}

export default plots
